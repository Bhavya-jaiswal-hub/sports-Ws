import 'dotenv/config';
import AgentAPI from 'apminsight';
AgentAPI.config();

import express from 'express' 
import http from 'http'
import { matchRouter } from './routes/matches.js';
import { attachWebSocketServer } from './ws/server.js';
import { securityMiddleware } from './arcjet.js';
import { commentaryRouter } from './routes/commentary.js';

const app = express();
app.set("trust proxy", true);

const parsedPort = Number(process.env.PORT);
const PORT =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : 8000;
const HOST = (process.env.HOST || '0.0.0.0');

app.use(express.json());
app.use(securityMiddleware())
const server =  http.createServer(app);

console.log("DATABASE_URL:", process.env.DATABASE_URL);

app.get('/', (req, res) => {
    res.send('Hello from Express Server');
}) 



app.use('/matches', matchRouter)
app.use('/matches/:id/commentary' , commentaryRouter)

const { broadcastMatchCreated , broadcastCommentary} = attachWebSocketServer(server);

app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary =   broadcastCommentary

server.listen(PORT, HOST,  () => { 
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server is running on ${baseUrl}`);

    console.log(`Websocket is running on ${baseUrl.replace('http' , 'ws')}/ws`);
});     