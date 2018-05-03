"use strict";

const bodyParser = require("body-parser"),
  config = require("config"),
  express = require("express"),
  https = require("https"),
  morgan = require("morgan"),
  request = require("request");
const apiai = require("apiai");

const APIAI_TOKEN = process.env.APIAI_ACCESS_TOKEN
  ? process.env.APIAI_ACCESS_TOKEN
  : config.get("clientAccessToken");
const apiaiApp = apiai(APIAI_TOKEN);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan("short"));
app.use(express.static("public"));

const WEATHER_API_KEY = process.env.WEATHER_API_KEY
  ? process.env.WEATHER_API_KEY
  : config.get("weatherApiKey");

const APP_SECRET = process.env.MESSENGER_APP_SECRET
  ? process.env.MESSENGER_APP_SECRET
  : config.get("appSecret");

const VALIDATION_TOKEN = process.env.MESSENGER_VALIDATION_TOKEN
  ? process.env.MESSENGER_VALIDATION_TOKEN
  : config.get("validationToken");

const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN
  ? process.env.MESSENGER_PAGE_ACCESS_TOKEN
  : config.get("pageAccessToken");

const SERVER_URL = process.env.SERVER_URL
  ? process.env.SERVER_URL
  : config.get("serverURL");

if (
  !(
    APIAI_TOKEN &&
    APP_SECRET &&
    VALIDATION_TOKEN &&
    PAGE_ACCESS_TOKEN &&
    SERVER_URL
  )
) {
  console.error("Missing config values");
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Express server listening to port ${PORT} in ${app.settings.env} mode`
  );
});

/* For Facebook Validation */
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] &&
    req.query["hub.verify_token"] === VALIDATION_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.status(403).end();
  }
});

/* Handling all messenges */
app.post("/webhook", (req, res) => {
  console.log(req.body);
  if (req.body.object === "page") {
    req.body.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && event.message.text) {
          sendMessage(event);
        }
      });
    });
    res.status(200).end();
  }
});

/* GET query from API.ai */

function sendMessage(event) {
  let sender = event.sender.id;
  let text = event.message.text;

  let apiai = apiaiApp.textRequest(text, {
    sessionId: "session_cat"
  });

  apiai.on("response", response => {
    console.log(response);
    let aiText = response.result.fulfillment.speech;

    request(
      {
        url: "https://graph.facebook.com/v2.6/me/messages",
        qs: { access_token: PAGE_ACCESS_TOKEN },
        method: "POST",
        json: {
          recipient: { id: sender },
          message: { text: aiText }
        }
      },
      (error, response) => {
        if (error) {
          console.log("Error sending message: ", error);
        } else if (response.body.error) {
          console.log("Error: ", response.body.error);
        }
      }
    );
  });

  apiai.on("error", error => {
    console.log(error);
  });

  apiai.end();
}

/* Webhook for API.ai to get response from the 3rd party API */
app.post("/ai", (req, res) => {
  console.log("*** Webhook for api.ai query ***");
  console.log(req.body.result);

  if (req.body.result.action === "weather") {
    console.log("*** weather ***");
    let city = req.body.result.parameters["geo-city"];
    let restUrl =
      "http://api.openweathermap.org/data/2.5/weather?APPID=" +
      WEATHER_API_KEY +
      "&q=" +
      city;

    request.get(restUrl, (err, response, body) => {
      if (!err && response.statusCode == 200) {
        let json = JSON.parse(body);
        console.log(json);
        let tempF = ~~(json.main.temp * 9 / 5 - 459.67);
        let tempC = ~~(json.main.temp - 273.15);
        let msg =
          "The current condition in " +
          json.name +
          " is " +
          json.weather[0].description +
          " and the temperature is " +
          tempF +
          " ℉ (" +
          tempC +
          " ℃).";
        return res.json({
          speech: msg,
          displayText: msg,
          source: "weather"
        });
      } else {
        let errorMessage = "I couldn't find the city name.";
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
      }
    });
  }
});
