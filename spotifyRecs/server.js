// required libraries
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const app = express();
const favicon = require("serve-favicon");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGO_DB_CONNECTION_STRING;
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
const dbCollection = {
  db: process.env.MONGO_DB_NAME,
  collection: process.env.MONGO_DB_COLLECTION_NAME,
};

// spotify stuff
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectURI = "http://localhost:5002/callback";

// default encoding
process.stdin.setEncoding("utf-8");

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
app.use(favicon(path.join(__dirname, "images", "spotify logo real.ico")));

// helper function
const randomString = (length) => {
  let result = "";

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

// get and post requests
app.get("/", (request, response) => {
  const variables = {
    port: port,
  };

  response.render("index", variables);
});

app.post("/submit", async (request, response) => {
  let user = {
    name: request.body.name,
    email: request.body.email,
    musicTaste: request.body.musicTaste,
  };

  try {
    await insertUser(client, dbCollection, user);
    response.redirect("/login");
  } catch (error) {
    console.error(error);
  }
});

async function insertUser(client, dbCollection, user) {
  await client.db(dbCollection.db).collection(dbCollection.collection).insertOne(user);
}

async function getTracks(token) {
  const response = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?limit=5",
    {
      headers: {
        Authorization: "Bearer " + token,
      },
    }
  );
  
  let topTracks = [];
  const data = await response.json();
  const tracks = data.items;

  tracks.forEach((track) => {
    const trackId = track.id;
    topTracks.push(trackId);
  });

  async function fetchWebApi(endpoint, method, body) {
    const res = await fetch(`https://api.spotify.com/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      method,
      body: JSON.stringify(body),
    });
    return await res.json();
  }

  async function getRecommendations() {
    return (
      await fetchWebApi(
        `v1/recommendations?limit=5&seed_tracks=${topTracks.join(",")}`,
        "GET"
      )
    ).tracks;
  }

  const recommendedTracks = await getRecommendations();
  let ret = recommendedTracks.map(
    ({ name, artists }) =>
      `${name} by ${artists.map((artist) => artist.name).join(", ")}`
  )

  return ret;
}

// TODO: spotify api integration
app.get("/login", (request, response) => {
  const state = randomString(16);
  const scope = "user-read-private user-read-email user-top-read";
  response.redirect(
    "https://accounts.spotify.com/authorize?" +
      new URLSearchParams({
        client_id: clientID,
        response_type: "code",
        redirect_uri: redirectURI,
        state: state,
        scope: scope,
      }).toString()
  );
});

app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (state === null) {
    res.redirect(
      "/#" +
        new URLSearchParams({
          error: "state_mismatch",
        }).toString()
    );
  } else {
    const authOptions = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        code: code,
        redirect_uri: redirectURI,
        grant_type: "authorization_code",
      },
      headers: {
        Authorization: "Basic " + Buffer.from(clientID + ":" + clientSecret).toString("base64"),
      },
      json: true,
    };

    request.post(authOptions, async function (error, response, body) {
      if (!error && response.statusCode === 200) {
        let accessToken = body.access_token;
        let refreshToken = body.refresh_token;
        let tracks = await getTracks(accessToken);
        let artists = [];
        let songs = [];
        
        tracks.map(item => {
          let parts = item.split(' by ');
          artists.push(parts[1]);
          songs.push(parts[0]);
        })

        const variables = {
          song1: songs[0],
          song2: songs[1],
          song3: songs[2],
          song4: songs[3],
          song5: songs[4],
          artist1: artists[0],
          artist2: artists[1],
          artist3: artists[2],
          artist4: artists[3],
          artist5: artists[4],
        };

        res.render("taste", variables);
      } else {
        res.send(`Error accessing token: ${error}`);
      }
    });
  }
});

app.get("/refresh_token", function (req, res) {
  let refresh_token = req.query.refresh_token;
  let authOptions = {
    url: "https://accounts.spotify.com/api/token",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + new Buffer.from(clientID + ":" + clientSecret).toString("base64"),
    },
    form: {
      grant_type: "refresh_token",
      refresh_token: refresh_token,
    },
    json: true,
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      let access_token = body.access_token;
      let refreshToken = body.refresh_token;
      res.send({
        access_token: access_token,
        refresh_token: refreshToken,
      });
    }
  });
});

app.listen(port);
