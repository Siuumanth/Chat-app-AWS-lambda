const ENDPOINT = 'WS url'
// AWS lambda code for reference

import { 
  ApiGatewayManagementApiClient as Client, 
  PostToConnectionCommand 
} from "@aws-sdk/client-apigatewaymanagementapi";

const client = new Client({ endpoint: ENDPOINT });
const names = {}

const sendToOne = async (id, body) => {
  try {
    const command = new PostToConnectionCommand({
      ConnectionId: id,
      Data: Buffer.from(JSON.stringify(body))
    });
    console.log("📤 Sending to one:", id, body);
    await client.send(command);
  } catch (err) {
    console.log("❌ Error sending to one:", err);
  }
};


const sendToAll = async (ids, body) =>{
  const all = ids.map(i => sendToOne(i, body));
  return Promise.all(all);
}

const test = async (event) => {
  console.log("🔍 EVENT:", JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from socket!" } + 'heyy')
  };
};

export const handler = async (event) => {
  console.log("Incoming Event:", JSON.stringify(event));

  // first we will need info about the request
  // which will be in the request context
  
  let result = {
    statusCode: 200,
    body: JSON.stringify('Hello from chubs!')
  };

  if(event.requestContext){

    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    //will countain one of the routes that we defined
    let body = {}

    try{
      if(event.body){
        body = JSON.parse(event.body);
        //has stringified json
      }
    }catch(err){
      console.log("Error parsing body: ", err);
    }

  
    // 6 cases for 6 routes
    switch(routeKey){
      case "$connect":
        break;

      case "$disconnect":
        await sendToAll(Object.keys(names), { systemMessage: `${names[connectionId]} has left the chat` });
        console.log("👋 Disconnected: ", connectionId)
        delete names[connectionId]
        await sendToAll(Object.keys(names), {members: Object.values(names)});
        break;

      case "$default":
        break;

      case "setName":
        names[connectionId] = body.name;
        await sendToAll(Object.keys(names), {members: Object.values(names)});
        await sendToAll(Object.keys(names), {systemMessage: `${names[connectionId]} has joined the chat`});
        console.log("name as been setted")
        break;

      case "sendPublic":
        await sendToAll( Object.keys(names), {publicMessage : `${names[connectionId]}: ${body.message}`});
        console.log("public message sent")
        break;

      case "sendPrivate":

        //finding connection id of recipient
        const to = Object.keys(names).find(key => names[key] === body.to);
        await sendToOne(to, { privateMessage : `${names[connectionId]}: ${body.message}` });
        console.log("private message sent")
       break;



      default:
        console.log("Unknown route key: ", routeKey);
    }

  }


  // TODO implement
  const response = {
    statusCode: 200,
    body: JSON.stringify('Hello from chubs!'),
  };
  return result;
};
