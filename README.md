# knavalbattle.js
A Node.js library for [KNavalBattle/KBattleship](https://invent.kde.org/games/knavalbattle).

## How to use:
1. Install the library into your Node.js project:
```sh
$ npm install knavalbattle.js
```

2. Import the client:
```js
// ESM:
import { NavalClient } from "knavalbattle.js";

// CJS:
const { NavalClient } = require("knavalbattle.js");
```

3. Initialize the client and events:
```js
const client = new NavalClient("NICKNAME");

client.on("connect", (player) => {
    client.sendChatMessage(`Hi ${player.nickname}!`);
});

client.on("begin", () => {
    // Create your own ships and track them.
});

client.on("move", (hit) => {
    client.sendMoveResponse(hit.respond('miss'));
});

client.on("gameOver", (winner) => {
    if (winner.me) {
        client.sendChatMessage("I win!");
    } else { 
        client.sendChatMessage("You won!");
    }
});
```

4. Connect to a peer!
```js
client.connect(54321, "127.0.0.1");
```

## Contributing
YES PLEASE. I made this in about 7 hours and so there are bound to be bugs. If you discover any bugs or anything, make an issue or a PR on the [GitHub repo](https://github.com/DaInfLoop/knavalbattle.js)!

## Licensing
This repository and NPM package are licensed under the MIT License. A version of the license can be viewed in the [LICENSE](https://github.com/DaInfLoop/knavalbattle.js/blob/main/LICENSE) file.