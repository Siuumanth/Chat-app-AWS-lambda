### WebSocket Chat App Setup Notes (AWS Lambda + API Gateway)

The main idea is to use AWS API Gateway's WebSocket support to manage persistent connections, and use a Lambda function as the backend handler for all events.

#### API Gateway WebSocket Setup

- **WebSocket API Created**  
    Used API Gateway (WebSocket type) to set up real-time communication for the chat app. This allows clients to maintain an open connection with the server for bi-directional messaging.
    
- **Routes Selection Expressions**  
    Created the following routes for different types of messages and events:
    - `$connect`: Triggered when a client connects to the WebSocket server.
    - `$disconnect`: Triggered when a client disconnects.
    - `$default`: Called when a message doesn’t match any of the defined routes.
    - `sendPublic`: Used to send messages to all connected clients.
    - `sendPrivate`: Used to send a message to a specific connection ID (private chat).
    - `setName`: Allows clients to set a display name associated with their connection.
        
- **Single Lambda Function (chat-api-handler)**  
    All the above routes are integrated with one common Lambda function (`chat-api-handler`). This function handles the logic for each route by checking the `routeKey` in the event. It keeps the setup simple and centralizes logic, making it easier to manage and deploy.
    
- **Stage Created: `production`**  
    A deployment stage named `production` was created to deploy and test the WebSocket API. This is the URL that clients will use to connect.
    

#### WebSocket and Connection URLs

- **WebSocket URL**  
    This is the main endpoint used by clients to establish a WebSocket connection to the API. Format looks like:
    `wss://<api-id>.execute-api.<region>.amazonaws.com/production`
    
    This is what you'll use in your front-end (e.g., with `new WebSocket(...)`) to connect to your chat server.
    
- **Connection URL (Not the same as WebSocket URL)**  
    This isn’t used by the client directly. Internally, in the Lambda function, I can use the API Gateway management API to send messages to specific connected clients. It's mainly used when sending private messages or disconnecting a client programmatically.


When we post to to the connection URL with connection ID as argument, private message will be sent to that connection ID fellow.
#### Why This Setup?

- Using WebSockets allows real-time communication between clients and server without needing to poll for updates.
    
- Offloading routing and connection management to API Gateway simplifies infrastructure.
    
- Using Lambda keeps the backend serverless, scalable, and low-maintenance.
    
- The single Lambda function approach works fine at early stages; might split routes later if needed for performance or clarity.

---


### WebSocket Logging & Route Debugging 

- Initially, when I connected using `wscat`, the **Lambda wasn’t logging anything**. CloudWatch had no logs showing up, even though I had `console.log()` statements.
    
- Before all that, the **first major issue** I ran into was a **502 Internal Server Error**. That was because the YT tutorial I was following was using **CommonJS module syntax (`module.exports`)** instead of the required **ES module syntax (`export`)**. After updating the code to use ES modules properly, the 502 error disappeared, but the logs still didn’t show up.
    
- I then tried sending requests using `wscat` to test routes like this:
    ```bash
     `wscat -c wss://<your-api-id>.execute-api.<region>.amazonaws.com/production > {"action":"sendPublic","message":"hello world"}    
```
   
    - But nothing happened. No logs, no visible output, no errors

Then, to understand what was really the problem, I learnt to enable  CloudWatch logging under the **Logs/Tracing** section in API Gateway. I thought it was set up properly because I ticked the "Enable CloudWatch Logs" checkbox and saved the changes. But even after that, **no logs were appearing** when I triggered my Lambda via `wscat`.

I also double-checked my Lambda function to ensure it had the necessary `console.log()` statements for debugging. But again, nothing came through in CloudWatch Logs. That's when I realized something deeper was missing in the logging setup.

- I added `console.log("Incoming Event:", JSON.stringify(event));` to debug the incoming event in my Lambda. Still, **nothing appeared in CloudWatch**. That’s when I figured something deeper was wrong.
    
- Eventually, I saw the message:  
    **“CloudWatch Logs role ARN must be set in account settings to enable logging.”**
    
    So I did the following:
    - Went to **API Gateway → Stages → production → Logs/Tracing**.
    - Enabled **“Enable CloudWatch Logs”** and chose **“INFO” level**.
    - Assigned the **IAM role** with the policy `AmazonAPIGatewayPushToCloudWatchLogs`.
        
- Once the logs started coming in, I spotted this error:
    
    `Unknown route key: sendPublic`
    
    - That’s when I realized: in API Gateway WebSocket routes, **route keys must start with a `$`**.
    - So I updated my wscat request to:
        
        `> {"action":"$sendPublic","message":"hello world"}`
        
    - After that, the **Lambda function executed properly**, and I finally saw the correct logs in CloudWatch, including my `console.log()` output.
        
- Even before fixing the `$`, the logs showed **HTTP 200 status**, which was misleading because the function wasn’t actually doing what I expected.

---
# CODE:
```javascript
const ENDPOINT = 'https://<awesomeID>.execute-api.ap-southeast-1.amazonaws.com/production'

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
```

### 🔗 Endpoint and API Client Setup

```js
const ENDPOINT = 'https://<your-api-id>.execute-api.<region>.amazonaws.com/production';
```

- This is the WebSocket endpoint provided by API Gateway.

```js
import { ApiGatewayManagementApiClient as Client, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
const client = new Client({ endpoint: ENDPOINT });
```

- You use AWS SDK v3 to send messages back to connected clients via WebSocket.
    
---
### 🧠 In-Memory Store for Names

```js
const names = {};
```

- Stores `connectionId → name` mapping.
    
- Only works during the current Lambda execution (not persisted).
    
---
### 📤 Send Message to One Client

```js
const sendToOne = async (id, body) => {...};
```

- Sends a JSON message to a single WebSocket client using their connection ID.
    
---
### 📢 Broadcast Message to All

```js
const sendToAll = async (ids, body) => {...};
```

- Sends the same message to all connection IDs (basically all users).
    
---
### 🚪 Lambda Handler Entry Point

```js
export const handler = async (event) => {...};
```

- Main function that handles all WebSocket events.
- Based on `event.requestContext.routeKey`, it performs different actions.
    
---

### 📦 Parsing Event Details

```js
const connectionId = event.requestContext.connectionId;
const routeKey = event.requestContext.routeKey;
```

- Get current user's connection ID and which route triggered this event.
    

---

### 🔍 Parsing Incoming Message

```js
if(event.body){ body = JSON.parse(event.body); }
```

- Incoming messages from clients are stringified JSON. Parse it before using.
    

---
### 📶 Route Handlers

#### `$connect`
- Triggered when a new client connects.
- (Currently does nothing)

#### `$disconnect`
- Triggered when a user leaves.
- Broadcasts that they left and updates the member list.
#### `setName`
- Stores the user's chosen name.
- Broadcasts updated members and welcome message.
#### `sendPublic`
- Sends a message from one user to **all** users.
#### `sendPrivate`
- Finds recipient by name and sends them a private message.
#### `$default`
- Catch-all for any unexpected route.
    

---

### ✅ Final Lambda Response

```js
return {
  statusCode: 200,
  body: JSON.stringify('Hello from chubs!')
};
```

- Required by AWS even for WebSocket events.
    
---
