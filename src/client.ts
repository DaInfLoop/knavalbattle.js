import { 
    type ShipDefinition,
    NotificationMessage, 
    GameOptionsMessage, 
    GameOverMessage, 
    RestartMessage, 
    HeaderMessage, 
    BeginMessage, 
    MoveMessage, 
    ChatMessage, 
    NickMessage, 
    Message
} from "./message";
import EventEmitter from "node:events";
import { createConnection, type Socket } from 'node:net';

/**
 * The multiple states a game of KNavalBattle can be in.
 */
export enum GameState {
    /**
     * Client is not connected to another client.
     */
    DISCONNECTED,

    /**
     * One or both clients are setting up their ships.
     */
    SHIP_SETUP,

    /**
     * This client can fire at the other client's shipyard.
     */
    FIRE_SHIPS_SELF,

    /**
     * This client must confirm whether the other client's shot was successful.
     */
    AWAIT_RESPONSE_SELF,

    /**
     * The other client can fire at this client's shipyard.
     */
    FIRE_SHIPS_OTHER,

    /**
     * The other client must confirm whether this client's shot was successful.
     */
    AWAIT_RESPONSE_OTHER,

    /**
     * Game over!
     */
    GAME_OVER
}

/**
 * Represents a player.
 */
type Player = {
    /**
     * Is this player the client?
     */
    me: boolean,

    /**
     * This player's nickname.
     */
    nickname: string
}

/**
 * A client used to interface with KNavalBattle/KBattleship.
 * @extends {EventEmitter}
 */
export class NavalClient extends EventEmitter<{
    // Emitted on all messages sent: the raw XML string is passed as argument
    raw: [string]

    // Connected to other client, sends info about them
    connect: [Player]

    // Opponent sent a chat message
    chat: [ChatMessage]

    // Opponent placed ships, game begin!
    begin: [boolean]

    // Opponent shot somewhere
    move: [MoveMessage]

    // You can fire at a ship!
    canFire: []

    // Game over! Player passed is the winner!
    gameOver: [Player]
}> {
    /**
     * Emitted on all messages sent: the raw XML string is passed as argument
     * @event NavalClient#raw
     * @param {string} xmlStr Raw XML from the other client.
     */

    /**
     * Connected to other client, sends info about them
     * @event NavalClient#connect
     * @param {Player} player The other client's player info
     */

    /**
     * Other client sent a chat message.
     * @event NavalClient#chat
     * @param {ChatMessage} message The message sent by the other client.
     */

    /**
     * Other client has placed their ships, game has started.
     * @event NavalClient#begin
     * @param {boolean} [restartDetected] Whether this game start was because the other client restarted
     */

    /**
     * Other client has shot somewhere.
     * @event NavalClient#move
     * @param {MoveMessage} hit The position at which the other client shot.
     */

    /**
     * This client can now fire at the other client's shipyard.
     * @event NavalClient#canFire
     */

    /**
     * Game over!
     * @event NavalClient#gameOver
     * @param {Player} player The player who won.
     */

    /**
     * This client's nickname.
     */
    nickname: string;
    private _gameState: GameState = GameState.DISCONNECTED;

    /**
     * The options that the client is following for the game.
     */
    gameOptions: {
        adjacentShips: boolean,
        allowMultipleOfSame: boolean,
        longestShip: number,
        boardWidth: number,
        boardHeight: number,
        shipDefinitions: ShipDefinition[]
    }
    #socket: Socket | undefined;

    /**
     * A list of co-ordinates that this client has shot at this game.
     */
    firedAt: [number, number][] = [];

    /**
     * The current opponent.
     */
    opponent?: Player

    /**
     * The current game state.
     * @see {@link GameState}
     */
    get gameState() {
        return this._gameState
    }

    set gameState(value) {
        throw new Error('cannot write to gameState')
    }

    constructor(nickname: string = "KNavalBattle.js") {
        super();

        this.nickname = nickname;
        this.gameOptions = {
            adjacentShips: true,
            allowMultipleOfSame: false,
            longestShip: 4,
            boardHeight: 10,
            boardWidth: 10,
            shipDefinitions: [
                {
                    name: "minesweeper",
                    plural: "minesweepers",
                    number: 1,
                    size: 1
                },
                {
                    name: "frigate",
                    plural: "frigates",
                    number: 1,
                    size: 2
                },
                {
                    name: "cruise",
                    plural: "cruises",
                    number: 1,
                    size: 3
                },
                {
                    name: "carrier",
                    plural: "carriers",
                    number: 1,
                    size: 4
                }
            ]
        }
    }

    /**
     * Send a chat message to the other client
     * @param {string} text The message to send
     */
    sendChatMessage(text: string): void {
        const chatMessage = new ChatMessage(text, this.nickname);

        this.#socket?.write(chatMessage.toXML())
    }

    /**
     * Send a game over message to the other client.
     * 
     * Requires that at least one of your ships has sunk, and that you have just confirmed a hit/sink.
     */
    sendGameOver(): void {
        if (this._gameState == GameState.FIRE_SHIPS_SELF) throw new Error('you can only send game over after sending a move response')        

        const gameOver = new GameOverMessage();

        this.emit('gameOver', this.opponent!)

        this.#socket?.write(gameOver.toXML());
    }

    /**
     * Request a restart from the other client.
     * 
     * You will not be told the result: use the {@link NavalClient} begin event's `[restartDetected]` parameter to detect restarts.
     */
    requestRestart() {
        const restartMsg = new RestartMessage();

        this.#socket?.write(restartMsg.toXML())
    }

    #handleMessage(xmlStr: string) {
        const message = Message.fromXML(xmlStr);

        console.log("RECV", message)

        if (message instanceof HeaderMessage) {
            const myHeader = new HeaderMessage(
                '0.1.0', 'KBattleship', 4, 'The Naval Battle game'
            )

            return this.#socket?.write(myHeader.toXML())
        }

        if (message instanceof GameOptionsMessage) {
            this.gameOptions = {
                adjacentShips: message.enabledAdjacentShips,
                allowMultipleOfSame: message.allowMultipleOfSame,
                longestShip: message.longestShip,
                boardHeight: message.boardHeight,
                boardWidth: message.boardWidth,
                shipDefinitions: message.shipDefinitions
            }

            return this.#socket?.write(message.toXML())
        }

        if (message instanceof NickMessage) {
            const myNick = new NickMessage(this.nickname);

            this._gameState = GameState.SHIP_SETUP;

            this.#socket?.write(myNick.toXML())

            this.opponent = {
                me: false,
                nickname: message.nickname
            }

            return this.emit('connect', this.opponent)
        }

        if (message instanceof ChatMessage) {
            return this.emit('chat', message)
        }

        if (message instanceof BeginMessage) {
            this.#socket?.write(message.toXML())
            const detectedRestart = this._gameState !== GameState.SHIP_SETUP

            this.firedAt = []
            this._gameState = GameState.FIRE_SHIPS_OTHER;

            return this.emit('begin', detectedRestart)
        }

        if (message instanceof MoveMessage) {
            const withSocket = new MoveMessage(message.x, message.y)

            this._gameState = GameState.AWAIT_RESPONSE_SELF

            return this.emit('move', withSocket)
        }

        if (message instanceof GameOverMessage) {
            this._gameState = GameState.GAME_OVER

            return this.emit('gameOver', {
                me: true,
                nickname: this.nickname
            })
        }
    }

    /**
     * Send a response to the other client's about its shot.
     * @param {NotificationMessage} notification The result generated by {@link MoveMessage.respond}.
     */
    sendMoveResponse(notification: NotificationMessage) {
        if (this._gameState !== GameState.AWAIT_RESPONSE_SELF) throw new Error('cannot send response right now')

        this.#socket?.write(notification.toXML())

        this._gameState = GameState.FIRE_SHIPS_SELF
        this.emit('canFire')
    }

    /**
     * During your turn, attempt to fire at a position on the other client's shipyard.
     * @param {[number, number]} position The position in which you want to shoot.
     * @async
     * @returns {Promise<NotificationMessage>} A {@link NotificationMessage} that confirms whether the shot was successful or not.
     */
    sendFireAt(position: [number, number]): Promise<NotificationMessage>
    /**
     * During your turn, attempt to fire at a position on the other client's shipyard.
     * @param {[number, number]} position The position in which you want to shoot.
     * @param {function(Error, NotificationMessage=): void} callback A function that will be called on failure/success of your shot.
     */
    sendFireAt(position: [number, number], callback: (err?: Error, notification?: NotificationMessage) => void): void
    sendFireAt(position: [number, number], callback?: (err?: Error, notification?: NotificationMessage) => void): Promise<NotificationMessage> | void {
        const innerFunction = async (): Promise<NotificationMessage> => {
            if (this._gameState !== GameState.FIRE_SHIPS_SELF) {
                throw new Error('cannot fire at ships right now')
            }

            if (this.firedAt.find(([x, y]) => x == position[0] && y == position[1])) {
                throw new Error('already fired in this position')
            }

            const move = new MoveMessage(position[0], position[1]);

            return new Promise((res, rej) => {
                const waitForNotification = (xmlStr: string) => {
                    const message = Message.fromXML(xmlStr);

                    if (message instanceof NotificationMessage
                        && message.x == position[0]
                        && message.y == position[1]
                    ) {
                        this.firedAt.push(position)
                        this.off('raw', waitForNotification)
                        res(message)
                    }
                }
    
                this.on('raw', waitForNotification)
                this.#socket?.write(move.toXML())
            })
        }

        if (callback) {
            innerFunction()
                .then(notification => callback(undefined, notification))
                .catch(err => callback(err))
            return
        } else {
            return innerFunction();
        }
    }

    /**
     * Connect to another client
     * @param {number} port The port that the other client is using
     * @param {string} host The IP address of the other client
     */
    connect(port: number = 54321, host: string = '127.0.0.1') {
        if (this._gameState !== GameState.DISCONNECTED) throw new Error('already connected to a server')

        this.#socket = createConnection(
            { host, port }
        )

        this.#socket.on('data', (data) => {
            const str = data.toString();
            this.emit('raw', str)
            this.#handleMessage(str)
        })
    }

    /**
     * Disconnect from the current client gracefully.
     */
    disconnect() {
        if (this._gameState === GameState.DISCONNECTED) throw new Error('not connected to a server, cannot disconnect')

        this.#socket?.end();

        this.#socket?.once('close', () => {
            this._gameState = GameState.DISCONNECTED
        })
    }
}