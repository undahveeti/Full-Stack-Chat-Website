
const express = require("express");
const socketIO = require('socket.io');
const http = require('http');
const cors  = require("cors");
const session = require('express-session');
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bodyParser = require( 'body-parser');
const auth = require('./routes/auth');
const rooms = require('./routes/rooms');

const app = express(); 
const server = http.createServer(app);

const Message = require('./model/messages.js')
const Room = require('./model/room.js')
const User = require('./model/user.js');
const { isKeyObject } = require("util/types");

// TODO: add cors to allow cross origin requests
const io = socketIO(server, {
  cors: {
    origin: '*',
  }
});
app.use(cors({origin: 'http://localhost:3000', credentials:true }))


dotenv.config();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());



// Connect to the database
// TODO: your code here
mongoose.connect(process.env.MONGO_URL);
const database = mongoose.connection;

database.on('error', (error) => console.log(error));
database.once('open', () => console.log('Connected to Database'));

// Set up the session
// TODO: your code here
const sessionMiddleware = session({
  resave: false,
  saveUninitialized: false,
  secret: process.env.SESSION_SECRET,
})

app.use(sessionMiddleware);


app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ message: "logged in" });
  }
  else {  
    console.log("not logged in")
    res.json({ message: "not logged" });
  }
});


app.use("/api/auth/", auth);


// checking the session before accessing the rooms
app.use((req, res, next) => {
  if (req.session && req.session.authenticated) {
    //console.log("req.session.authenticated:", req.session.authenticated)
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
});
app.use("/api/rooms/", rooms);



// Start the server
server.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});

// TODO: make sure that the user is logged in before connecting to the socket
// TODO: your code here
io.use((socket, next) => {
  //console.log("socket io middleware")
  sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
  if (socket.request.session && socket.request.session.authenticated) {
    console.log("authorized")
    next();
  } else {
    console.log("unauthorized")
    next();
    //next(new Error('unauthorized'));
  }
});


io.on('connection', (socket)=>{
  let room = undefined;
  let username = undefined;
  let roomMessages = [];
  console.log("user connected")
  // TODO: write codes for the messaging functionality
  // TODO: your code here
  socket.on("disconnect", ()=>{
    console.log("user disconnected")
  })

  socket.on("room delete", async(roomObj)=>{
    io.emit("update room after deletion", {msg: "update room"})
    io.to(roomObj.name).emit("room gone", {msg: "failed message"})
  })

  socket.on("search", async(msg)=>{
    tempArray = []
    const allMessages = await Message.find({}).populate('sender').populate('room')
    for (let i = 0; i < allMessages.length; ++i){
      if(allMessages[i].room.name == room){
        if( (allMessages[i].sender.name).includes(msg)  || (allMessages[i].message.text).includes(msg) )
          tempArray.push(allMessages[i])
      }
    }
    roomMessages = tempArray
    socket.emit("search history", roomMessages)
    /* console.log("INDEX JS THE MESSAGES", roomMessages) */
  })

  socket.on("emoted", async(data) => {

    const messageListForRoom = await Message.find({_id: data.id}).populate('sender').populate('room')
    msg = messageListForRoom[0]
    if(msg.emoji == 'dislike'){
      if(data.stance === 'like'){
        const updateMessage = {
          $set: {
            emoji: data.stance,
          },
        }
        const result = await Message.updateOne({_id: data.id}, updateMessage)
      }
      else{
        const updateMessage = {
          $set: {
            emoji: "none",
          },
        }
        const result = await Message.updateOne({_id: data.id}, updateMessage)
      }
    }
    else if(msg.emoji == 'like'){
      if(data.stance === 'dislike'){
        const updateMessage = {
          $set: {
            emoji: data.stance,
          },
        }
        const result = await Message.updateOne({_id: data.id}, updateMessage)
      }
      else{
        const updateMessage = {
          $set: {
            emoji: "none",
          },
        }
        const result = await Message.updateOne({_id: data.id}, updateMessage)
      }
    }
    else{
      const updateMessage = {
        $set: {
          emoji: data.stance,
        },
      }
      const result = await Message.updateOne({_id: data.id}, updateMessage)
    }

    //reload history
    const r = await Room.findOne({name: room})
    const messagesForRoom = await Message.find({room:(r._id)}).populate('sender').populate('room')
    if(messagesForRoom){
      roomMessages = messagesForRoom;
      io.to(room).emit("load history", roomMessages)
    }
    else{
      console.log("MESSAGES NOT FOUND")
    }
  })

  socket.on("edited message", async(data) => {
    console.log("Receiving in socket edited message")
    console.log("DATA RECEIVED", data)
    const updateMessage = {
      $set: {
        message: {text:data.newMsg},
      },
    }
    const result = await Message.updateOne({_id: data.id}, updateMessage)
    //reload history
    const r = await Room.findOne({name: room})
    const messagesForRoom = await Message.find({room:(r._id)}).populate('sender').populate('room')
    if(messagesForRoom){
      roomMessages = messagesForRoom;
      io.to(room).emit("load history", roomMessages)
    }
    else{
      console.log("MESSAGES NOT FOUND")
    }
  })

  socket.on("chat message", async(text)=>{
    const u = await User.findOne({username: username})
    const r = await Room.findOne({name: room})
    
    const message = new Message ({
      message: {text:text},
      sender: u._id,
      room: r._id,
      emoji: "none",
    })

    try{
      const dataSaved = await message.save();
    }

    catch (error){
        console.log(error);
    }

    //io.to(room).emit('update')
    //reload history
    const messagesForRoom = await Message.find({room:(r._id)}).populate('sender').populate('room')
    if(messagesForRoom){
      roomMessages = messagesForRoom;
      //socket.emit("load history", roomMessages)
      /* socket.broadcast.to(room).emit("load history", roomMessages) */
      io.to(room).emit("load history", roomMessages)
    }
    else{
      console.log("MESSAGES NOT FOUND")
    }
    
  })

  /* socket.on("grab history", async(data) => { */
  socket.on("grab history", async() => {
    roomMessages = []
    const r = await Room.findOne({name: room})
    const messagesForRoom = await Message.find({room:(r._id)}).populate('sender').populate('room')
    if(messagesForRoom){
      roomMessages = messagesForRoom;
      socket.emit("load history", roomMessages)
    }
    else{
      console.log("MESSAGES NOT FOUND")
    }
  })

  socket.on("join", (data) => {
    socket.join(data.room);
    room = data.room;
    username = data.username;
    console.log(`user is joined to room ${data.room}`)
  })

})