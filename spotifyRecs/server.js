// // required libraries
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const querystring = require('querystring');
const app = express();
const favicon = require("serve-favicon");
require("dotenv").config({path: path.resolve(__dirname, '.env')});

const {MongoClient, ServerApiVersion} = require('mongodb');
const uri = process.env.MONGO_DB_CONNECTION_STRING;
const client = new MongoClient(uri, {serverApi: ServerApiVersion.v1});
const dbCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_DB_COLLECTION_NAME};

// spotify stuff
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectURI = `http://localhost:5002/callback`

// default encoding
process.stdin.setEncoding('utf-8');

// invalid number of commands
if (process.argv.length !== 3) {
    console.log(`Usage ${path.basename(process.argv[1])}`);
    process.exit(1);
}

// port number and message to show server is starting
const port = process.argv[2];
console.log(`Web server started and running at http://localhost:${port}/`);
const prompt = "Stop to shutdown the server: ";

// show prompt and make it listen for 'stop' command
process.stdout.write(prompt);
process.stdin.on("readable", async function () {
    let input = process.stdin.read();
    if (input !== null) {
        let cmd = input.trim();
        if (cmd === "stop") {
            process.stdout.write("Shutting down the server\n");
            process.stdout.write("Closing connection to database\n");
            await client.close();
            process.exit(0);
        } else {
            process.stdout.write(`Invalid command: ${cmd}\n`);
        }

        process.stdout.write(prompt);
        process.stdin.resume();
    }   
});

// main connection function
async function main() {
    try {
        await client.connect();
    } catch(error) {
        console.log("Failed to connect.", error);
    }
}

main();

// setting templates directory
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended: false}));
app.use(favicon(path.join(__dirname, 'images', 'spotify logo real.ico')));

// get and post requests
app.get("/", (request, response) => {
    const variables = {
        port: port,
    };

    response.render('index', variables);
});

app.post("/submit", async (request, response) => {
    let user = {
        name: request.body.name,
        email: request.body.email,
        musicTaste: request.body.musicTaste
    };

    try {
        await insertUser(client, dbCollection, user);
        response.redirect("/recommendations");
    } catch(error) {
        console.error(error);
    }
});

app.get("/recommendations", (request, response) => {
    // variables would go here for song name and artist

    response.render('taste');
});

async function insertUser(client, dbCollection, user) {
    await client.db(dbCollection.db).collection(dbCollection.collection).insertOne(user);
}

const randomString = (length) => {
    let result = "";

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
};

// TODO: spotify api integration
app.get("/login", (request, response) => {
    const state = randomString(16);
    const scope = 'user-read-private user-read-email user-top-read';
    response.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: clientID,
      scope: scope,
      redirect_uri: redirectURI,
      state: state
    }));
});

app.get("/callback", (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
  
    if (state === null) {
      res.redirect(
        "/#" +
        new URLSearchParams({
          error: "state_mismatch"
        }).toString()
      );
    } else {
      const authOptions = {
        url: "https://accounts.spotify.com/api/token",
        form: {
          code: code,
          redirect_uri: redirectURI,
          grant_type: "authorization_code"
        },
        headers: {
          Authorization: "Basic " + Buffer.from(clientID + ":" + clientSecret).toString("base64")
        },
        json: true
      };
    }
});



app.listen(port);