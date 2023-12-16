// // required libraries
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const querystring = require('querystring');
const app = express();
const favicon = require("serve-favicon");
require("dotenv").config({ path: path.resolve(__dirname, '.env') });

const { MongoClient, ServerApiVersion } = require('mongodb');
const { response } = require("express");
const { getSystemErrorMap } = require("util");
const uri = process.env.MONGO_DB_CONNECTION_STRING;
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
const dbCollection = { db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_DB_COLLECTION_NAME };

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
    } catch (error) {
        console.log("Failed to connect.", error);
    }
}

main();

// setting templates directory
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
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
    } catch (error) {
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


const getRefreshToken = async (token) => {

    // refresh token that has been previously stored
    //const refreshToken = localStorage.getItem('refresh_token');
    const url = "https://accounts.spotify.com/api/token";

    const payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: token,
            client_id: clientID
        }),
    };

    try {
        const response = await fetch(url, payload);
        const data = await response.json();

        // Assuming the response contains an access token and a new refresh token
        const accessToken = data.access_token;
        const newRefreshToken = data.refresh_token;
        console.log("Access: " + accessToken);
        console.log("Refresh: " + newRefreshToken);

        // Update the stored access token and refresh token
        // localStorage.setItem('access_token', accessToken);
        return newRefreshToken;
        // localStorage.setItem('refresh_token', newRefreshToken);
    } catch (error) {
        console.error('Error refreshing token:', error);
        // Handle the error (e.g., redirect to login page)
    }
}

app.get("/callback", async (req, res) => {


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

        // fetch(authOptions.url, {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/x-www-form-urlencoded',
        //         'Authorization': 'Basic ' + Buffer.from(clientID + ':' + clientSecret).toString('base64'),
        //     },
        //     body: new URLSearchParams(authOptions.form),
        // })
        //     .then(async response => response.json())
        //     .then(async data => {
        //         const recommendationsURL = 'https://api.spotify.com/v1/me/top/artists';


        //         let accessToken = data.access_token
        //         let newToken = await getRefreshToken(accessToken)


        //         return fetch(recommendationsURL, {
        //             method: 'GET',
        //             headers: {
        //                 'Authorization': 'Bearer ' + newToken,
        //             },
        //         });
        //     })
        //     .then(async response => response.json())
        //     .then(async recommendations => {
        //         // Handle recommendations data here
        //         console.log('Recommendations:', recommendations);
        //         res.redirect("/recommendations");
        //     })
        //     .catch(error => {
        //         console.error('Error exchanging code for token:', error);
        //         res.redirect(
        //             "/#" +
        //             new URLSearchParams({
        //                 error: "token_exchange_error"
        //             }).toString()
        //         );
        //     });
        req.post(authOptions, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                let accessToken = body.access_token;
                let refreshToken = body.refresh_token;
                res.send({
                    'access_token': accessToken,
                    'refresh_token': refreshToken
                });
            } else {
                res.send(`Error accessing token: ${error}`);
            }
        });
    }
});

app.listen(port);