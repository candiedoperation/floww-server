const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const cors = require('cors');
const bodyParser = require('body-parser');
const CollabViewMiddleware = require('./middleware/CollabViewMiddleware');

app.use(cors({
  origin: '*'
}));

app.use(bodyParser.json({
  limit: '10mb'
}));

app.use(bodyParser.urlencoded({
  extended: true,
  limit: "10mb",
}));

app.get('/', (req, res) => {
  res.send('<h1>Floww Server is listening to API requests!</h1>');
});

server.listen(3001, () => {
  // Initialize Middleware
  CollabViewMiddleware(server);

  console.log('floww-server:3001');
});