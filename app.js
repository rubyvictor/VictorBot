"use strict";

const bodyParser = require("body-parser"),
  config = require("config"),
  express = require("express"),
  https = require("https"),
  morgan = require("morgan"),
  request = require("request");

const APIAI_TOKEN = process.env.APIAI_ACCESS_TOKEN
  ? process.env.APIAI_ACCESS_TOKEN
  : config.get("clientAccessToken");
const apiAI = require("apiai")(APIAI_TOKEN);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan("short"));
app.use(express.static("public"));

const WEATHER_API_KEY = process.env.WEATHER_API_KEY ? process.env.WEATHER_API_KEY : config.get("weatherApiKey")

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

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VALIDATION_TOKEN
  ) {
    console.log("Validating webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

app.post("/webhook", (req, res) => {
  console.log(req.body);
  //   let data = req.body;
  if (req.body.object === "page") {
    req.body.entry.forEach(entry => {
      console.log(entry.id, entry.time);
      entry.messaging.forEach(event => {
        if (event.message && event.message.text) {
          sendMessage(event);
        } else {
          console.log("Webhook received unknown messagingEvent: ", event);
        }
      });
    });
    res.sendStatus(200).send("Event received");
  }
});

function sendMessage(event) {
  let sender = event.sender.id;
  let text = event.message.text;

  let api_ai = apiAi.textRequest(text, { sessionId: "scot_cat" });

  api_ai.on("response", response => {
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

  api_ai.on("error", error => {
    console.log(error);
  });

  api_ai.end();
}

app.post('/ai', (req, res) => {
  if (req.body.result.action === 'weather') {
    let city = req.body.result.parameters['geo-city'];
    let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID='+WEATHER_API_KEY+'&q='+city;

    request.get(restUrl, (err, response, body) => {
      if (!err && response.statusCode == 200) {
        let json = JSON.parse(body);
        let msg = json.weather[0].description + ' and the temperature is ' + json.main.temp + ' ℉';
        return res.json({
          speech: msg,
          displayText: msg,
          source: 'weather'});
      } else {
        return res.status(400).json({
          status: {
            code: 400,
            errorType: 'I didn\'t manage to look up the city name.'}});
      }})
  }

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Express server listening to port ${PORT} in ${app.settings.env} mode`
  );
});
