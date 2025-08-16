import { XMLParser, XMLBuilder } from "fast-xml-parser";

/**
 * The message type sent by a client.
 */
export enum MessageType {
    Header,
    Reject,
    Nick,
    Begin,
    Move,
    Notification,
    GameOver,
    Restart,
    Chat,
    GameOptions
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '$',
});
const builder = new XMLBuilder({
    attributeNamePrefix: '$',
    ignoreAttributes: false,
    format: true,
    indentBy: "  "
});

/**
 * The base Message class.
 */
export abstract class Message {
    constructor(public type: MessageType) { }

    /**
     * Convert this message to XML to send raw over TCP.
     */
    abstract toXML(): string;

    /**
     * Convert this message to XML to send raw over TCP.
     */
    toString() {
        return this.toXML()
    }

    /**
     * Convert a raw XML message into its respective Message class.
     * @param xmlStr The raw XML string from the other client
     * @returns A Message class based on the message given
     * @example ```ts
     * const myMessage = `<!DOCTYPE kmessage>
     * <kmessage>
     *     <msgtype type="Nick">2</msgtype>
     *     <nickname>DaInfLoop</nickname>
     * </kmessage>`;
     * 
     * const converted = Message.fromXML(myMessage);
     * 
     * converted instanceof NickMessage; // true
     * ```
     */
    static fromXML(xmlStr: string): Message {
        const parsed = parser.parse(xmlStr);

        if (!parsed.kmessage) throw new Error('invalid formatting')

        const kmessage = parsed.kmessage as {
            msgtype: {
                $type: string;
                '#text': number;
            };
            [key: string]: unknown;
        };

        const typeNum = kmessage.msgtype['#text'];
        const type = typeNum as MessageType;

        switch (type) {
            case MessageType.Header:
                return new HeaderMessage(
                    kmessage.protocolVersion as string,
                    kmessage.clientName as string,
                    kmessage.clientVersion as number,
                    kmessage.clientDescription as string
                );
            case MessageType.GameOptions:
                return new GameOptionsMessage(
                    kmessage.enabledAdjacentShips as boolean,
                    (kmessage.oneOrSeveralShips as {
                        '#text': boolean,
                        '$longestShip': string
                    })['#text'] as boolean,
                    parseInt((kmessage.oneOrSeveralShips as {
                        '#text': boolean,
                        '$longestShip': string
                    })['$longestShip']) as number,
                    kmessage.boardWidth as number,
                    kmessage.boardHeight as number,
                    (kmessage.ships as {
                        '$name': string,
                        '$number': string,
                        '$pluralName': string,
                        '$size': string
                    }[]).map(x => ({
                        name: x.$name,
                        plural: x.$pluralName,
                        number: parseInt(x.$number),
                        size: parseInt(x.$size)
                    }))
                )
            case MessageType.Nick:
                return new NickMessage(kmessage.nickname as string)
            case MessageType.Chat:
                return new ChatMessage(kmessage.chat as string, kmessage.nickname as string)
            case MessageType.Begin:
                return new BeginMessage()
            case MessageType.Move:
                return new MoveMessage(kmessage.fieldx as number, kmessage.fieldy as number)
            case MessageType.Notification:
                return new NotificationMessage(
                    kmessage.fieldx as number,
                    kmessage.fieldy as number,
                    kmessage.fieldstate as 1 | 99,
                    kmessage.death as true | undefined,
                    kmessage.xstart && kmessage.xstop && kmessage.ystart && kmessage.ystop ?
                        [[kmessage.xstart as number, kmessage.ystart as number], [kmessage.xstop as number, kmessage.ystop as number]]
                        : undefined as [[number, number], [number, number]] | undefined
                )
            case MessageType.GameOver:
                return new GameOverMessage()
            case MessageType.Restart:
                return new RestartMessage()
            case MessageType.Reject:
                return new RejectMessage(kmessage.versionMismatch as boolean, kmessage.reason as string)
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    }
}

/**
 * A message sent as part of client handshake. Gives information on the client.
 */
export class HeaderMessage extends Message {
    constructor(public protocolVersion: string, public clientName: string, public clientVersion: number, public clientDescription: string) {
        super(MessageType.Header)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '$type': 'Header',
                    '#text': 0
                },
                protocolVersion: this.protocolVersion,
                clientName: this.clientName,
                clientVersion: this.clientVersion,
                clientDescription: this.clientDescription
            }
        })}`
    }
}

/**
 * A message sent as part of client handshake. Tells each client the other client's name.
 */
export class NickMessage extends Message {
    constructor(
        public nickname: string
    ) {
        super(MessageType.Nick)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 2,
                    '$type': "Nick"
                },
                nickname: this.nickname
            }
        })}`
    }
}

export type ShipDefinition = {
    name: string,
    plural: string,
    number: number,
    size: number
}

/**
 * A message sent as part of client handshake. Tells the connected client the "server client's" game settings.
 */
export class GameOptionsMessage extends Message {
    constructor(
        public enabledAdjacentShips: boolean,
        public allowMultipleOfSame: boolean,
        public longestShip: number,
        public boardWidth: number,
        public boardHeight: number,
        public shipDefinitions: ShipDefinition[]
    ) {
        super(MessageType.Header)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '$type': 'GameOptions',
                    '#text': 9
                },
                enabledAdjacentShips: this.enabledAdjacentShips,
                oneOrSeveralShips: {
                    '$longestShip': this.longestShip,
                    '#text': this.allowMultipleOfSame
                },
                boardWidth: this.boardWidth,
                boardHeight: this.boardHeight,
                ships: this.shipDefinitions.map(definition => ({
                    '$name': definition.name,
                    '$number': definition.number.toString(),
                    '$pluralName': definition.plural,
                    '$size': definition.size.toString()
                }))
            }
        })}`
    }
}

/**
 * A chat message sent via KNavalBattle's chat function.
 */
export class ChatMessage extends Message {
    constructor(
        public text: string,
        public nickname: string
    ) {
        super(MessageType.Chat)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 8,
                    '$type': "Chat"
                },
                chat: this.text,
                nickname: this.nickname
            }
        })}`
    }
}

/**
 * Message sent when a client has finished placing its ships.
 */
export class BeginMessage extends Message {
    constructor() {
        super(MessageType.Begin)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 3,
                    '$type': "Begin"
                }
            }
        })}`
    }
}

/**
 * Message sent to confirm a hit, sink or miss.
 */
export class NotificationMessage extends Message {
    fieldState: "Hit" | "Miss" | "Sink"

    constructor(public x: number, public y: number, fieldstate: 1 | 99, death?: boolean, public sinkCoordinates?: [[number, number], [number, number]]) {
        super(MessageType.Notification)

        if (fieldstate == 99) this.fieldState = "Miss"
        else {
            if (death) this.fieldState = "Sink"
            else this.fieldState = "Hit"
        }
    }

    toXML(): string {
        if (this.fieldState !== "Sink") {
            return `<!DOCTYPE kmessage>
${builder.build({
                kmessage: {
                    msgtype: {
                        '#text': 5,
                        '$type': "Notification"
                    },
                    fieldx: this.x,
                    fieldy: this.y,
                    fieldstate: this.fieldState == "Miss" ? 99 : 1
                }
            })}`
        } else {
            return `<!DOCTYPE kmessage>
${builder.build({
                kmessage: {
                    msgtype: {
                        '#text': 5,
                        '$type': "Notification"
                    },
                    fieldx: this.x,
                    fieldy: this.y,
                    fieldstate: 1,
                    death: true,
                    xstart: this.sinkCoordinates![0][0],
                    xstop: this.sinkCoordinates![1][0],
                    ystart: this.sinkCoordinates![0][1],
                    ystop: this.sinkCoordinates![1][1]
                }
            })}`
        }
    }
}

/**
 * Message sent when a client attempts to fire at a ship.
 */
export class MoveMessage extends Message {
    constructor(public x: number, public y: number) {
        super(MessageType.Move)
    }

    /**
     * Create a response to this ship fire attempt. 
     * @param {"hit" | "miss"} message The result of the attack ("hit", "miss", "sink").
     * @returns A `NotificationMessage` that can be used with `NavalClient#sendMoveResponse.` 
     */
    respond(message: "hit" | "miss"): NotificationMessage
    /**
     * Create a response to this ship fire attempt. 
     * @param {"sink"} message The result of the attack ("hit", "miss", "sink").
     * @param {[[number, number], [number, number]]} shipCoordinates Coordinates of the sunk ship.
     * @returns A `NotificationMessage` that can be used with `NavalClient#sendMoveResponse.` 
     */
    respond(message: "sink", shipCoordinates: [[number, number], [number, number]]): NotificationMessage
    /**
     * Create a response to this ship fire attempt. 
     * @param {"hit" | "miss" | "sink"} message The result of the attack ("hit", "miss", "sink").
     * @param {[[number, number], [number, number]]} [shipCoordinates] Optional coordinates of the ship if sunk.
     * @returns A `NotificationMessage` that can be used with `NavalClient#sendMoveResponse.` 
     */
    respond(message: "hit" | "miss" | "sink", shipCoordinates?: [[number, number], [number, number]]) {
        if (message !== "sink") {
            const notification = new NotificationMessage(this.x, this.y, message == "miss" ? 99 : 1, false)

            return notification
        } else {
            const notification = new NotificationMessage(this.x, this.y, 1, true, shipCoordinates);

            return notification
        }
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 4,
                    '$type': "Move"
                },
                fieldx: this.x,
                fieldy: this.y
            }
        })}`
    }
}

/**
 * Message sent when the game has finished.
 */
export class GameOverMessage extends Message {
    constructor() {
        super(MessageType.GameOver)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 6,
                    '$type': "GameOver"
                }
            }
        })}`
    }
}

/**
 * Message sent when a restart is requested from the other client.
 * 
 * Unused by the official KDE Naval Battle client.
 */
export class RestartMessage extends Message {
    constructor() {
        super(MessageType.Restart)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 7,
                    '$type': "Restart"
                }
            }
        })}`
    }
}

/**
 * Message sent when a "server client" refuses to connect with a client.
 */
export class RejectMessage extends Message {
    constructor(public versionMismatch: boolean, public reason: string) {
        super(MessageType.Reject)
    }

    toXML(): string {
        return `<!DOCTYPE kmessage>
${builder.build({
            kmessage: {
                msgtype: {
                    '#text': 1,
                    '$type': "Reject"
                },
                versionMismatch: this.versionMismatch,
                reason: this.reason
            }
        })}`
    }
}