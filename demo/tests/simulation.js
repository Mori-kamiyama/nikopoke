const { io } = require("socket.io-client");
const { spawn } = require("child_process");
const path = require("path");

const SERVER_PATH = path.join(__dirname, "../server/index.js");
const PORT = 3000;
const URL = `http://localhost:${PORT}`;

let serverProcess;

function startServer() {
    return new Promise((resolve, reject) => {
        console.log("Starting server...");
        serverProcess = spawn("node", [SERVER_PATH], {
            env: { ...process.env, PORT: PORT.toString() },
            stdio: "pipe" // Capture output to check for startup
        });

        serverProcess.stdout.on("data", (data) => {
            const output = data.toString();
            // console.log("[Server]", output.trim());
            if (output.includes(`Server running on port ${PORT}`)) {
                resolve();
            }
        });

        serverProcess.stderr.on("data", (data) => {
            console.error("[Server Error]", data.toString());
        });

        serverProcess.on("error", (err) => {
            reject(err);
        });
    });
}

function stopServer() {
    if (serverProcess) {
        console.log("Stopping server...");
        serverProcess.kill();
        serverProcess = null;
    }
}

function createClient(name) {
    const socket = io(URL, {
        reconnection: false,
    });
    return socket;
}

async function runPvPTest() {
    console.log("\n=== Running PvP Test ===");
    const client1 = createClient("Player 1");
    const client2 = createClient("Player 2");

    const roomId = "test_pvp_room";

    return new Promise((resolve, reject) => {
        let turn = 0;
        let c1Ready = false;
        let c2Ready = false;

        client1.on("connect", () => {
            client1.emit("join_room", { roomId, mode: "pvp", playerName: "P1" });
        });

        client2.on("connect", () => {
            client2.emit("join_room", { roomId, mode: "pvp", playerName: "P2" });
        });

        const handleUpdate = (socket, data, role) => {
            if (data.state.turn === 0 && turn === 0) {
                console.log(`${role} received Turn 0.`);
                if (role === "P1") c1Ready = true;
                if (role === "P2") c2Ready = true;

                if (c1Ready && c2Ready) {
                    turn = 1;
                    // Find a valid move
                    const myPlayer = data.state.players.find(p => p.id === data.myId);
                    const active = myPlayer.team[myPlayer.activeSlot];
                    const moveId = active.moves[0];
                    
                    console.log("Both players submitting actions...");
                    client1.emit("submit_action", { roomId, action: { type: "move", moveId } });
                    client2.emit("submit_action", { roomId, action: { type: "move", moveId } });
                }
            } else if (data.state.turn === 1) {
                console.log(`${role} received Turn 1.`);
                // Success!
                if (role === "P1") { // Resolve only once
                     client1.disconnect();
                     client2.disconnect();
                     resolve();
                }
            }
        };

        client1.on("battle_update", (data) => handleUpdate(client1, data, "P1"));
        client2.on("battle_update", (data) => handleUpdate(client2, data, "P2"));

        setTimeout(() => reject(new Error("PvP Test Timeout")), 5000);
    });
}

async function runPvETest(mode) {
    console.log(`\n=== Running PvE Test (${mode}) ===`);
    const client = createClient("Player");
    const roomId = `test_pve_${mode}`;

    return new Promise((resolve, reject) => {
        let turn = 0;

        client.on("connect", () => {
            client.emit("join_room", { roomId, mode, playerName: "Human" });
        });

        client.on("battle_update", (data) => {
            if (data.state.turn === 0 && turn === 0) {
                console.log("Turn 0 started. Sending move...");
                const myPlayer = data.state.players.find(p => p.id === data.myId);
                const active = myPlayer.team[myPlayer.activeSlot];
                const moveId = active.moves[0];
                
                client.emit("submit_action", { roomId, action: { type: "move", moveId } });
                turn = 1;
            } else if (data.state.turn === 1) {
                console.log("Turn 1 reached. AI responded.");
                client.disconnect();
                resolve();
            }
        });

        setTimeout(() => reject(new Error(`${mode} Test Timeout`)), 10000); // Give AI some time
    });
}

async function main() {
    try {
        await startServer();
        await runPvPTest();
        await runPvETest("pve_minimax");
        await runPvETest("pve_mcts");
        console.log("\nAll tests passed successfully!");
    } catch (err) {
        console.error("\nTest Failed:", err);
    } finally {
        stopServer();
        process.exit();
    }
}

main();
