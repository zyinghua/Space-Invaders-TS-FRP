/*
Student Name: Yinghua Zhou
Student ID: 31158773
*/
/*There are segments of code (indicated using comments) that come from / derived from Tim's Asteroids example code, 
they are obtained from the Asteroids notes/ the intex.ts in the "asteroids5" package.
Reference links: https://tgdwyer.github.io/asteroids/ & https://stackblitz.com/edit/asteroids05?file=index.ts */

import { fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";

//Below types are derived from the Asteroids example code
type Key = "ArrowLeft" | "ArrowRight" | "Space" | "Enter" | "Escape";
type Event = "keydown" | "keyup";
// Following is derived from the Asteroids example code
// The game has the following view element types:
type ViewType = "ship" | "alien" | "shipBullet" | "alienBullet" | "shield";

function spaceinvaders() {
    // Inside this function you will use the classes and functions
    // from rx.js
    // to add visuals to the svg element in spaceomvaders.html, animate them, and make them interactive.
    // Study and complete the tasks in observable examples first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!

    const CONSTANTS = {
        CanvasSize: 600,
        ShipRadius: 13,
        ShipMovement: 3,
        BulletRadius: 3,
        AlienBulletMovement: -3,
        ShipBulletMovement: 5,
        AlienMovement: 5, // Initially moving right
        SpacingBetweenAliens: 50,
        AlienMovingDownSpacing: -20,
        AlienRadius: 12,
        ShieldRadius: 12,
        StartAlienCount: 50,
        StartShieldBlockCount: 80,
        ShieldBlockSpacing: 10,
        NumOfBlocksPerShield: 20,
        AlienMoveCDFactor: 1, // The alien movement speed is going to be [AlienMoveCDFactor * number of living aliens]
        InitialAlienFireCD: 80, // Fire from aliens every 70 * 10ms = 0.7 second
        AlienFireSpeedUpPerLevel: 30, // Alien fire countdown will be 30 * 10 ms less per level
        ShipFireSpeedDownPerLevel: 30, // Ship fire countdown will be 50 * 10 ms more per level
        ObjValidTime: 180, // Objects (Only bullets in this game) will expire after this time duration
        ScorePerAlienEliminated: 10,
        ScorePerAlienBulletOffset: 5,
        MaxLevel: 3,
    } as const;

    // Function "torusWrap" is derived from the Asteroids example code
    const CanvasSize = 600,
        torusWrap = ({ x, y }: Position) => {
            const wrap = (v: number) =>
                v < 0 ? v + CanvasSize : v > CanvasSize ? v - CanvasSize : v;
            return new Position(wrap(x), wrap(y));
        },
        // Returns whether the given object is reaching the left/right boarder,
        // only used for the aliens in this game
        reachingLRBorder = (obj: Body) => {
            // We test whether the object's NEXT movement will reach the border
            const coord =
                obj.movement > 0
                    ? obj.pos.movePosH(obj.movement).movePosH(obj.radius).x
                    : obj.pos.movePosH(obj.movement).movePosH(-obj.radius).x;
            return coord >= CONSTANTS.CanvasSize || coord <= 0;
        },
        // Returns whether the given alien is hitting the ground, if so then game over
        // We test whether moving the alien down NEXT time will hit the ground
        alienHittingTheGround = (alien: Body) =>
            alien.pos
                .movePosV(CONSTANTS.AlienMovingDownSpacing)
                .movePosV(-alien.radius).y >= CONSTANTS.CanvasSize;

    // ***** This is an IMPURE function *****
    // Only used for setting up the initial position of the alien bullets
    const RNG = (max: number) => Math.floor(Math.random() * max);

    //*****CONTROLLER*****/

    // "Tick" is derived from the Asteroids example code
    class Tick {
        constructor(public readonly elapsed: number) {}
    }

    class Fire {
        constructor() {}
    }

    class Move {
        constructor(public readonly moveBy: number) {}
    }

    class RestartGame {
        constructor() {}
    }

    class UnsubscribeGame {
        constructor() {}
    }

    // Below function is derived from the Asteroids example code
    const observeKey = <T>(eventName: string, k: Key, result: () => T) =>
            fromEvent<KeyboardEvent>(document, eventName).pipe(
                filter(({ code }) => code === k),
                filter(({ repeat }) => !repeat),
                map(result)
            ),
        // gameClock is derived from the Asteroids example code
        // In this context Tick() is basically for managing the state every 10ms
        gameClock = interval(10).pipe(map((elapsed) => new Tick(elapsed))),
        // Derived from the Asteroids example code
        // Capture the key events and map them into corresponding actions
        startLeftMove = observeKey(
            "keydown",
            "ArrowLeft",
            () => new Move(-CONSTANTS.ShipMovement)
        ),
        startRightMove = observeKey(
            "keydown",
            "ArrowRight",
            () => new Move(CONSTANTS.ShipMovement)
        ),
        stopLeftMove = observeKey(
            "keyup",
            "ArrowLeft",
            () => new Move(CONSTANTS.ShipMovement)
        ),
        stopRightMove = observeKey(
            "keyup",
            "ArrowRight",
            () => new Move(-CONSTANTS.ShipMovement)
        ),
        fire = observeKey("keydown", "Space", () => new Fire()),
        restart = observeKey("keydown", "Enter", () => new RestartGame()),
        unsub = observeKey("keydown", "Escape", () => new UnsubscribeGame());

    //*****MODEL*****/

    // Derived from the Asteroids example code
    type Body = Readonly<{
        viewType: ViewType;
        id: string;
        pos: Position;
        movement: number; // Currently moving by <movement> pixels
        movingHorizontally: boolean; // True if moving horizontally, false if vertically
        radius: number;
        createTime: number;
    }>;

    // Derived from the Asteroids example code
    type State = Readonly<{
        time: number;
        ship: Body;
        shipBullets: ReadonlyArray<Body>;
        alienBullets: ReadonlyArray<Body>;
        exit: ReadonlyArray<Body>;
        objCount: number;
        aliens: ReadonlyArray<Body>;
        shields: ReadonlyArray<Body>;
        gameOver: boolean; // Player may restart when gameOver
        unsub: boolean; // But if unsub then the game really ends
        score: number;
        aliensMovingDown: boolean;
        alienFireCountdown: number;
        alienMoveCountdown: number;
        level: number;
        shipFireCountdown: number;
        victory: boolean; // True if the player successfully accomplishes all the levels up to CONSTANTS.MaxLevel
        //rng: number;
    }>;

    function createBullet(s: State, isShip: boolean): Body {
        return isShip
            ? {
                  viewType: "shipBullet",
                  id: `shipBullet${s.objCount}`, // Each bullet will have an unique id
                  // Set the position to the pos of the ship + the ship's radius so that it looks
                  //like fired by the ship rather than coming out from the middle of the ship
                  pos: s.ship.pos.movePosV(s.ship.radius),
                  movement: CONSTANTS.ShipBulletMovement, //Moving Up
                  movingHorizontally: false, // Moving vertically
                  radius: CONSTANTS.BulletRadius,
                  createTime: s.time,
              }
            : {
                  //Otherwise its a bullet from an alien
                  viewType: "alienBullet",
                  id: `alienBullet${s.objCount}`,
                  // Come out from a random living alien
                  pos: s.aliens[RNG(s.aliens.length)].pos.movePosV(
                      -CONSTANTS.AlienRadius
                  ),
                  movement: CONSTANTS.AlienBulletMovement, //Moving Down
                  movingHorizontally: false, // Moving vertically
                  radius: CONSTANTS.BulletRadius,
                  createTime: s.time,
              };
    }

    function createAlien(id: number): Body {
        return {
            viewType: "alien",
            id: `alien${id}`, // Each alien will have an unique id
            pos: new Position(
                // First row of aliens starts from (x,y) = (60,
                60 + CONSTANTS.SpacingBetweenAliens * (id % 10),
                // 280) with 50 pixels(CONSTANTS.SpacingBetweenAliens)
                // of spacing between each alien and 10 aliens per row
                280 - CONSTANTS.SpacingBetweenAliens * ((id - (id % 10)) / 10)
            ), // Initial position for each alien based on the id
            movement: CONSTANTS.AlienMovement, // Initially moving right
            movingHorizontally: true, // Initially moving horizontally
            radius: CONSTANTS.AlienRadius,
            createTime: 0,
        };
    }

    function createShieldBlock(id: number): Body {
        return {
            viewType: "shield",
            id: `shield${id}`,
            pos: new Position(
                //First shield block is at (x,y) = (50, 450)
                //150 pixels of spacing between each shielded area
                // Each row contains 5 overlapping shield blocks
                50 +
                    150 *
                        ((id - (id % CONSTANTS.NumOfBlocksPerShield)) /
                            CONSTANTS.NumOfBlocksPerShield) +
                    CONSTANTS.ShieldBlockSpacing * (id % 5),
                450 +
                    CONSTANTS.ShieldBlockSpacing *
                        (((id % CONSTANTS.NumOfBlocksPerShield) -
                            ((id % CONSTANTS.NumOfBlocksPerShield) % 5)) /
                            5)
            ),
            movement: 0, // Shields always stand still
            movingHorizontally: true, // The value doesn't matter since shields don't move
            radius: CONSTANTS.ShieldRadius,
            createTime: 0,
        };
    }

    //Below function is derived from the Asteroids example code
    function createShip(): Body {
        return {
            viewType: "ship",
            id: "ship",
            pos: new Position(300, 550),
            movingHorizontally: true,
            movement: 0,
            radius: CONSTANTS.ShipRadius,
            createTime: 0,
        };
    }

    // Create "CONSTANTS.StartAlienCount" number of aliens at the start of the game
    const startAliens = [...Array(CONSTANTS.StartAlienCount)].map((_, id) =>
        createAlien(id)
    );

    // Create "CONSTANTS.StartAlienCount" number of aliens at the start of the game
    const startShields = [...Array(CONSTANTS.StartShieldBlockCount)].map(
        (_, id) => createShieldBlock(id)
    );

    //Below function is derived from the Asteroids example code
    const initialState: State = {
        time: 0,
        ship: createShip(),
        shipBullets: [],
        alienBullets: [],
        exit: [],
        objCount: CONSTANTS.StartAlienCount + CONSTANTS.StartShieldBlockCount,
        aliens: startAliens,
        shields: startShields,
        gameOver: false,
        unsub: false,
        score: 0,
        aliensMovingDown: false,
        alienFireCountdown: CONSTANTS.InitialAlienFireCD,
        alienMoveCountdown:
            CONSTANTS.AlienMoveCDFactor * CONSTANTS.StartAlienCount, // 1 * 50 initially
        level: 1,
        shipFireCountdown: 0, // No fire cd at the first level
        victory: false,
    };

    const handleLevelUpNewGame = (s: State) => {
        // Restart a higher level game only when MaxLevel is not reached
        return s.level != CONSTANTS.MaxLevel
            ? {
                  ...initialState,
                  // Remove everything from the previous state
                  exit: s.exit.concat(
                      // s.aliens already in s.exit in this case
                      s.alienBullets,
                      s.shields,
                      s.shipBullets
                  ),
                  level: s.level + 1,
                  score: s.score,
                  alienFireCountdown:
                      CONSTANTS.InitialAlienFireCD -
                      (s.level - 1) * CONSTANTS.AlienFireSpeedUpPerLevel,
                  shipFireCountdown:
                      (s.level - 1) * CONSTANTS.ShipFireSpeedDownPerLevel,
              }
            : //Otherwise the game terminates with showing victory to the player
              { ...s, victory: true };
    };

    // A function to move the bullets and the ship
    const moveObj = (obj: Body) =>
        <Body>{
            ...obj,
            // Keep the objects inside the canvas. Only useful
            // for the movement of the ship in terms of the design
            pos: obj.movingHorizontally
                ? torusWrap(obj.pos.movePosH(obj.movement))
                : obj.pos.movePosV(obj.movement), // If it's a bullet (only bullets are moving only vertically),
            //then let it go beyond the canvas as it will be removed anyway
        };

    // The function below moves the given alien down and turn its moving direction to the other side
    const moveAlienDownAndTurn = (alien: Body) =>
            <Body>{
                ...alien,
                pos: alien.pos.movePosV(CONSTANTS.AlienMovingDownSpacing),
                movement: -alien.movement,
            },
        // The function below returns [movement, index] of the first alien in the list
        // that is required to move down and turn direction.
        theAlienToMoveDown = (aliens: ReadonlyArray<Body>) =>
            aliens
                .map((alien, index) => [alien.movement, index])
                .reduce((acc, alien) => (alien[0] != acc[0] ? alien : acc));

    const handleAlienMovement = (s: State) => {
        const alienMoveReady = s.alienMoveCountdown == 0,
            //The function below will return true if moving any of the aliens is reaching the border
            // This is to guarantee our move after this current move is safe
            // The result is stored in s.aliensMovingDown
            aliensReachingBorder = s.aliens.filter(reachingLRBorder).length > 0,
            //The function below will return true if moving any of the aliens THIS time will hit the ground
            hittingTheGround =
                s.aliens.filter(alienHittingTheGround).length > 0;
        return {
            ...s,
            aliens: s.aliensMovingDown
                ? s.aliens.map((alien, index) =>
                      // Since we are moving the aliens down discretely (one by one):
                      // Get the index of the alien that requires moving down
                      index == theAlienToMoveDown(s.aliens)[1]
                          ? moveAlienDownAndTurn(alien)
                          : alien
                  )
                : alienMoveReady
                ? s.aliens.map(moveObj)
                : s.aliens,

            aliensMovingDown: s.aliensMovingDown
                ? // If it's in the state of moving down: If it was the last one updated, then <moving down> completes
                  !(theAlienToMoveDown(s.aliens)[1] == s.aliens.length - 1)
                : // Otherwise whether the aliens start moving down depends on whether any of them is reaching the border
                  aliensReachingBorder,
            alienMoveCountdown: alienMoveReady
                ? CONSTANTS.AlienMoveCDFactor * s.aliens.length
                : s.alienMoveCountdown - 1,
            // If any of the aliens hit the ground the game should end
            gameOver: s.gameOver || hittingTheGround,
        };
    };

    // Function "checkGameStatus" is like a check point, used after "handleCollisions" to check
    // whether all aliens are shot before moving the aliens
    const checkGameStatus = (s: State) => {
        return s.aliens.length == 0 && !s.gameOver
            ? //If all aliens are eliminated, restart the game with a higher level
              handleLevelUpNewGame(s)
            : handleAlienMovement(s);
    };

    // Function below "handleCollisions" is derived and modified from the Asteroids example code
    // check a State for collisions:
    // ship bullets destroy aliens remove them
    // ship bullets hit alien bullets remove them
    // alien bullets hit the ship ends the game
    // alien bullets collide with the shield blocks should remove them
    // ship bullets collide with the shield blocks should remove them
    // ship collides with any of the aliens ends the game
    const handleCollisions = (s: State) => {
        const bodiesCollided = ([a, b]: [Body, Body]) =>
                a.pos.sub(b.pos).len() < a.radius + b.radius,
            //*************************************************************/
            // *Handle collisons between the ship and the (aliens + alien bullets) */
            beingHit = (a: Body) => (objList: ReadonlyArray<Body>) =>
                objList.filter((b) => bodiesCollided([a, b])).length > 0,
            // Check if ship is being hit by any of the aliens or their bullets
            shipBeingHit =
                beingHit(s.ship)(s.alienBullets) || beingHit(s.ship)(s.aliens),
            //*************************************************************/
            // The function below pairs every element in list A with every
            // element in list B.
            pairAllObjects =
                (objListA: ReadonlyArray<Body>) =>
                (objListB: ReadonlyArray<Body>) =>
                    mergeMap(objListA, (a) =>
                        objListB.map<[Body, Body]>((b) => [a, b])
                    ),
            pairsOfCollision =
                (objListA: ReadonlyArray<Body>) =>
                (objListB: ReadonlyArray<Body>) =>
                    pairAllObjects(objListA)(objListB).filter(bodiesCollided),
            mapFirst = (l: [Body, Body][]) => l.map<Body>(([ele, _]) => ele),
            mapSecond = (l: [Body, Body][]) => l.map<Body>(([_, ele]) => ele),
            //*************************************************************/
            // *Handle collisons between the ship bullets and the aliens */
            collidedBulletsAndAliens = pairsOfCollision(s.shipBullets)(
                s.aliens
            ),
            collidedshipBulletsAliens = mapFirst(collidedBulletsAndAliens),
            collidedAliens = mapSecond(collidedBulletsAndAliens),
            //*******************************************************************/
            // *Handle collisons between the ship bullets and the alien bullets */
            collidedShipBAndAlienB = pairsOfCollision(s.shipBullets)(
                s.alienBullets
            ),
            collidedshipBulletsAlienB = mapFirst(collidedShipBAndAlienB),
            collidedAlienBulletsShipB = mapSecond(collidedShipBAndAlienB),
            //*******************************************************************/
            // *Handle collisons between the alien bullets and the shield blocks */
            collidedAlienBAndShields = pairsOfCollision(s.alienBullets)(
                s.shields
            ),
            collidedAlienBWithS = mapFirst(collidedAlienBAndShields),
            collidedShieldBWithAB = mapSecond(collidedAlienBAndShields),
            //*******************************************************************/
            // *Handle collisons between the ship bullets and the shield blocks */
            collidedShipBAndShields = pairsOfCollision(s.shipBullets)(
                s.shields
            ),
            collidedShipBWithS = mapFirst(collidedShipBAndShields),
            collidedShieldBWithSB = mapSecond(collidedShipBAndShields),
            // array a except anything in b
            cut = except((a: Body) => (b: Body) => a.id === b.id);

        return checkGameStatus({
            ...s,
            // Cut out all the ship bullets that collide with any of the aliens/alien bullets/shield blocks
            shipBullets: cut(
                cut(cut(s.shipBullets)(collidedshipBulletsAliens))(
                    collidedshipBulletsAlienB
                )
            )(collidedShipBWithS),
            alienBullets: cut(cut(s.alienBullets)(collidedAlienBulletsShipB))(
                collidedAlienBWithS
            ),
            aliens: cut(s.aliens)(collidedAliens),
            shields: cut(cut(s.shields)(collidedShieldBWithAB))(
                collidedShieldBWithSB
            ),
            exit: s.exit.concat(
                collidedshipBulletsAliens,
                collidedAliens,
                collidedshipBulletsAlienB,
                collidedAlienBulletsShipB,
                collidedAlienBWithS,
                collidedShieldBWithAB,
                collidedShipBWithS,
                collidedShieldBWithSB
            ),
            gameOver: shipBeingHit,
            score:
                s.score +
                CONSTANTS.ScorePerAlienEliminated * collidedAliens.length +
                CONSTANTS.ScorePerAlienBulletOffset *
                    collidedAlienBulletsShipB.length,
        });
    };

    //Below function is derived and modified from the Asteroids example code
    // A function that we will apply when Tick() is observed.
    const tick = (s: State, elapsed: number) => {
        const expired = (obj: Body) =>
                elapsed - obj.createTime > CONSTANTS.ObjValidTime,
            expiredShipBullets: Body[] = s.shipBullets.filter(expired),
            activeShipBullets = s.shipBullets.filter(not(expired)),
            expiredAlienBullets: Body[] = s.alienBullets.filter(expired),
            activeAlienBullets = s.alienBullets.filter(not(expired)),
            alienFireReady = s.alienFireCountdown == 0,
            shipFireReady = s.shipFireCountdown == 0;

        return s.gameOver
            ? s // If gameOver then stop updating the state while waiting for player's input
            : handleCollisions({
                  //This one that we pass to handleCollisions is for handling
                  //the ship movement and updating the bullets
                  ...s,
                  ship: moveObj(s.ship),
                  shipFireCountdown: shipFireReady
                      ? 0 // Remain ready
                      : s.shipFireCountdown - 1,
                  shipBullets: activeShipBullets.map(moveObj),
                  alienBullets:
                      // Uncaught Typerror arises if we don't stop when the number
                      // of aliens becomes 0
                      alienFireReady && s.aliens.length != 0
                          ? activeAlienBullets
                                .map(moveObj)
                                .concat([createBullet(s, false)])
                          : activeAlienBullets.map(moveObj),
                  alienFireCountdown: alienFireReady
                      ? CONSTANTS.InitialAlienFireCD -
                        (s.level - 1) * CONSTANTS.AlienFireSpeedUpPerLevel
                      : s.alienFireCountdown - 1,
                  objCount: alienFireReady ? s.objCount + 1 : s.objCount,
                  exit: expiredShipBullets.concat(expiredAlienBullets),
                  time: elapsed, // Update the time
              });
    };

    //***** Manipulations *****/
    const reduceState = (
        s: State,
        e: Move | Fire | Tick | RestartGame | UnsubscribeGame
    ) =>
        e instanceof Move
            ? {
                  ...s,
                  ship: {
                      ...s.ship,
                      movement:
                          // Unexpected wierd double acceleration occurs sometimes when the keys
                          // are messily interacted. So we need to guarantee it is safe to update.
                          s.ship.movement + e.moveBy ==
                              -(2 * CONSTANTS.ShipMovement) ||
                          s.ship.movement + e.moveBy ==
                              2 * CONSTANTS.ShipMovement
                              ? s.ship.movement
                              : s.ship.movement + e.moveBy,
                  },
              }
            : e instanceof Fire
            ? s.shipFireCountdown == 0
                ? {
                      ...s,
                      shipBullets: s.shipBullets.concat([
                          createBullet(s, true),
                      ]),
                      objCount: s.objCount + 1,
                      shipFireCountdown:
                          (s.level - 1) * CONSTANTS.ShipFireSpeedDownPerLevel,
                  }
                : s
            : e instanceof RestartGame
            ? {
                  ...initialState,
                  // Remove everything from the previous state
                  exit: s.exit.concat(
                      s.aliens,
                      s.alienBullets,
                      s.shields,
                      s.shipBullets
                  ),
              }
            : e instanceof UnsubscribeGame
            ? // Unsubscribe only when gameOver (i.e., ignore 'Esc' when the game is running)
              { ...s, gameOver: false, unsub: s.gameOver }
            : tick(s, e.elapsed);

    //Derived from the Asteroids example code
    const mainGameStream = merge(
        gameClock,
        startLeftMove,
        startRightMove,
        stopLeftMove,
        stopRightMove,
        fire,
        restart,
        unsub
    )
        .pipe(scan(reduceState, initialState)) // For every element that comes through the stream, update the state
        .subscribe(updateView); // Update the view for every updated state

    //*****VIEW*****/
    function updateView(state: State): void {
        // Update the score
        const scoreInPage = document.getElementById("score");
        scoreInPage.innerText = `Score: ${state.score}`;
        // Update the level
        const levelInPage = document.getElementById("level");
        levelInPage.innerText = `Level: ${state.level}`;

        const svg = document.getElementById("canvas")!,
            ship = document.getElementById("ship")!,
            //Segment of code below is derived from the Asteroids example code
            updateBodyView = (b: Body) => {
                function createBodyView() {
                    const v = document.createElementNS(
                        svg.namespaceURI,
                        "ellipse"
                    )!;
                    v.setAttribute("id", b.id);
                    v.classList.add(b.viewType);
                    svg.appendChild(v);
                    return v;
                }
                const v = document.getElementById(b.id) || createBodyView();
                v.setAttribute("cx", String(b.pos.x));
                v.setAttribute("cy", String(b.pos.y));
                v.setAttribute("rx", String(b.radius));
                v.setAttribute("ry", String(b.radius));
            };

        state.shipBullets.forEach(updateBodyView);
        state.alienBullets.forEach(updateBodyView);
        state.aliens.forEach(updateBodyView);
        state.shields.forEach(updateBodyView);

        //Update the ship's position
        ship.setAttribute(
            "transform",
            `translate(${state.ship.pos.x},${state.ship.pos.y})`
        );

        //Segment of code below is derived from the Asteroids example code
        // To remove expired bullet(s) and alien(s)
        state.exit
            .map((obj) => document.getElementById(obj.id))
            .filter(isNotNullOrUndefined)
            .forEach((v) => {
                try {
                    svg.removeChild(v);
                } catch (e) {
                    // rarely it can happen that a bullet can be in exit
                    // for both expiring and colliding in the same tick,
                    // which will cause this exception
                    console.log("Already removed: " + v.id);
                }
            });

        // Derived from the Asteroids example code
        const show = (id: string, condition: boolean) =>
            ((e: HTMLElement) =>
                condition
                    ? e.classList.remove("hidden")
                    : e.classList.add("hidden"))(document.getElementById(id)!);

        show("gameover", state.gameOver);
        show("restart", state.gameOver);
        show("endtext", state.gameOver);
        show("maxlevel", state.level == CONSTANTS.MaxLevel && !state.gameOver);

        // Derived and modified from the Asteroids example code
        if (state.unsub) {
            mainGameStream.unsubscribe();
            const v = document.createElementNS(svg.namespaceURI, "text")!;

            v.setAttribute("x", String("60"));
            v.setAttribute("y", String("300"));
            v.classList.add("endgame");

            v.textContent = "Game Terminated";
            svg.appendChild(v);
        }

        // Derived and modified from the Asteroids example code
        if (state.victory) {
            mainGameStream.unsubscribe();

            const setText =
                (xPos: number) =>
                (yPos: number) =>
                (id: string) =>
                (text: string) => {
                    const v = document.createElementNS(
                        svg.namespaceURI,
                        "text"
                    )!;

                    v.setAttribute("x", String(xPos));
                    v.setAttribute("y", String(yPos));
                    v.classList.add(id);

                    v.textContent = text;
                    svg.appendChild(v);
                };

            setText(150)(200)("victory")("Victory!");
            setText(40)(250)("endText")("You have defeated all the invaders!");
            setText(85)(300)("endText")("The game is now terminated");
        }
    }
}

// the following simply runs your spaceinvaders function on window load. Make sure to leave it in place.
if (typeof window != "undefined")
    window.onload = () => {
        spaceinvaders();
    };

//*****[Citation] Segmented code below is from index.ts in the "asteroids5" package,
//downloaded from https://tgdwyer.github.io/asteroids/,
// End of citation is indicated below ******/
function showKeys() {
    function showKey(k: Key) {
        const arrowKey = document.getElementById(k)!,
            o = (e: Event) =>
                fromEvent<KeyboardEvent>(document, e).pipe(
                    filter(({ code }) => code === k)
                );
        o("keydown").subscribe((e) => arrowKey.classList.add("highlight"));
        o("keyup").subscribe((_) => arrowKey.classList.remove("highlight"));
    }
    showKey("ArrowLeft");
    showKey("ArrowRight");
    showKey("Space");
}

setTimeout(showKeys, 0);

//Derived from the Asteroids example code
function mergeMap<T, U>(
    a: ReadonlyArray<T>,
    f: (a: T) => ReadonlyArray<U>
): ReadonlyArray<U> {
    return Array.prototype.concat(...a.map(f));
}

//**** [Citation] END *****/

class Position {
    // A point with functions you may perform!
    constructor(public readonly x: number, public readonly y: number) {}
    // Functions <add>, <sub> and <len> are derived from the Asteroids example code
    add = (b: Position) => new Position(this.x + b.x, this.y + b.y);
    sub = (b: Position) => new Position(this.x - b.x, this.y - b.y);
    len = () => Math.sqrt(this.x * this.x + this.y * this.y);
    movePosH = (moveBy: number) => new Position(this.x + moveBy, this.y); // Move the position 'H'orizontally
    movePosV = (moveBy: number) => new Position(this.x, this.y - moveBy); // Move the position 'V'ertically
}

//*****[Citation] Segmented code below is from index.ts in the "asteroids5" package,
//downloaded from https://tgdwyer.github.io/asteroids/,
// End of citation is indicated below ******/
const /**
     * Composable not: invert boolean result of given function
     * @param f a function returning boolean
     * @param x the value that will be tested with f
     */

    // Derived from the Asteroids example code
    // A function that inverses the result of the function argument
    not =
        <T>(f: (x: T) => boolean) =>
        (x: T) =>
            !f(x),
    /**
     * is e an element of a using the eq function to test equality?
     * @param eq equality test function for two Ts
     * @param a an array that will be searched
     * @param e an element to search a for
     */
    elem =
        <T>(eq: (_: T) => (_: T) => boolean) =>
        (a: ReadonlyArray<T>) =>
        (e: T) =>
            a.findIndex(eq(e)) >= 0,
    /**
     * array a except anything in b
     * @param eq equality test function for two Ts
     * @param a array to be filtered
     * @param b array of elements to be filtered out of a
     */
    except =
        <T>(eq: (_: T) => (_: T) => boolean) =>
        (a: ReadonlyArray<T>) =>
        (b: ReadonlyArray<T>) =>
            a.filter(not(elem(eq)(b)));
/**
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends Object>(
    input: null | undefined | T
): input is T {
    return input != null;
}
//**** [Citation] END *****/
