import express from 'express' 
import http from 'http'
import { matchRouter } from './routes/matches.js';
import { attachWebSocketServer } from './ws/server.js';
import { securityMiddleware } from './arcjet.js';

const app = express();

const parsedPort = Number(process.env.PORT);
const PORT =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : 8000;
const HOST = (process.env.HOST || '0.0.0.0');

app.use(express.json());
const server =  http.createServer(app);

app.get('/', (req, res) => {
    res.send('Hello from Express Server');
}) 


app.use(securityMiddleware())
app.use('/matches', matchRouter)

const { broadcastMatchCreated} = attachWebSocketServer(server);

app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST,  () => { 
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server is running on ${baseUrl}`);

    console.log(`Websocket is running on ${baseUrl.replace('http' , 'ws')}/ws`);
});     