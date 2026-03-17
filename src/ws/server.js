import { WebSocket, WebSocketServer } from "ws"; 
import { wsArcjet, getClientIp } from "../arcjet.js";


const matchSubscribers = new Map();

// mai is used to stores the that which uses sockets subscribes the which matches 
  
function subscribe(matchId, socket){
      if(!matchSubscribers.has(matchId)) {
           matchSubscribers.set(matchId, new Set());
      } 

      matchSubscribers.get(matchId).add(socket);   
} 

function unsubscribe(matchId, socket){
      const subscribers = matchSubscribers.get(matchId);

      if(!subscribers) { 
          return;
      } 

      subscribers.delete(socket);

      if(subscribers.size === 0) {
           matchSubscribers.delete(matchId);
      }
} 

function cleanupSubscriptions(socket) {
      for(const matchId of socket.Subscriptions) {
          unsubscribe(matchId, socket);
      }

     
}




function  sendJson(socket, payload) {
     if(socket.readyState !== WebSocket.OPEN){
         return;
     }

     socket.send(JSON.stringify(payload));
} 


function broadcastToAll(wss , payload) {
    for(const client of wss.clients) {
         if(client.readyState !== WebSocket.OPEN) {
            continue;
}  

         client.send(JSON.stringify(payload))
    } 
} 
 // this function is used to boradcast only the subscribers those only subscribed the match 
function broadcastToMatch(matchId, payload){
      const subscribers = matchSubscribers.get(matchId);
      if(!subscribers || subscribers.size === 0) {
           return;
      } 

      const message = JSON.stringify(payload);

      for(const client of subscribers){
           if(client.readyState === WebSocket.OPEN){
                client.send(message);
           }
      }


}

const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;
const isValidMatchId = (value) => Number.isSafeInteger(value) && value > 0;

function handleMessage(socket, data) {
      let message;

      try{
                message = JSON.parse(data.toString());
      }  catch {
   sendJson(socket, { type: 'error', message: 'Invalid JSON' });
   return;
}

      if(message?.type === "subscribe") {


       if (!isValidMatchId(message.matchId)) {
                sendJson(socket, { type: "error", message: "Invalid matchId" });
                return;
           }
           if (
                !socket.Subscriptions.has(message.matchId) &&
                socket.Subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET
           ) {
                sendJson(socket, { type: "error", message: "Subscription limit reached" });
                return;
           }   
           subscribe(message.matchId, socket);
           socket.Subscriptions.add(message.matchId);
           sendJson(socket, {type: 'subscribed' , matchId: message.matchId});
           return;
      }

      if(message?.type === "unsubscribe" && Number.isInteger(message.matchId)){
           unsubscribe(message.matchId, socket);
           socket.Subscriptions.delete(message.matchId);
           sendJson(socket, { type: 'unsubscribed' , matchId: message.matchId});
      }
}

export function attachWebSocketServer(server) {
     const wss  = new WebSocketServer({ server,  path: '/ws' , maxPayload: 1024 * 1024}); 


     wss.on('connection' ,  async(socket ,req) => { 
           

        if(wsArcjet) {
             try {
                const ip = getClientIp(req);
                if(ip && !req.headers["x-forwarded-for"]) {
                  req.headers["x-forwarded-for"] = ip;
                }
                const decision = await wsArcjet.protect(req);

                if(decision.isDenied()){
                     const code =  decision.reason.isRateLimit() ? 1013 : 1008;

                     const reason = decision.reason.isRateLimit() ? 'Rate Limit exceeded' : 'Access Denied';


                     socket.close(code, reason);
                     return;
                }
             } catch (e) {
                 console.error('ws connection error' , e);
                 socket.close(1011 ,'server security error');
                 return;
             }
        }
        socket.isAlive = true; 

        socket.on('pong',  () => { socket.isAlive = true});
     
       socket.Subscriptions = new Set();

        sendJson(socket, { type: 'welcome'});

        socket.on('message' , (data) => {
           handleMessage(socket,data);
        })  

       socket.on('error', (err) => {
   console.error("WebSocket error:", err);
   socket.terminate();
});

        socket.on('close' , () => {
           cleanupSubscriptions(socket);
        })

        
     });


     const interval = setInterval( () => {
         wss.clients.forEach((ws) => {
            if(ws.isAlive === false) {
             ws.terminate();
             return;
            } 

            ws.isAlive = false;
            ws.ping();
         })
     } , 30000)

     wss.on('close',  () => clearInterval(interval));

     function broadcastMatchCreated(match) {
            broadcastToAll(wss, { type: 'match_created', data: match});
     } 

     function broadcastCommentary(matchId, comment) {
           broadcastToMatch(matchId , {type: 'commentary' , data: comment})
     }

     return  { broadcastMatchCreated , broadcastCommentary};
}
