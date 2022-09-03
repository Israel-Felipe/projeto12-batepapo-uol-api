import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect(() => {
  db = mongoClient.db("batepapoUOL");
});

const app = express();
app.use(cors());
app.use(express.json());


const participantsSchema = joi.object({
    name: joi.string().required()
});

const messagesSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.valid('message').valid('private_message').required(),
    from: joi.string().required(),
    time: joi.required()
});

app.post('/participants', async (req, res) => {
    const participant = req.body;

    const validation = participantsSchema.validate(participant);
    if (validation.error) {
        res.status(422).send(validation.error.details[0].message);
        return;
    }

    if (await db.collection('participants').findOne({name: participant.name})) {
        res.status(409).send({message: 'Usuário já existe'});
        return;
    } 

    const message = {
        from: participant.name,
        to: 'Todos', 
        text: 'entra na sala...',
        type: 'status',
        time: dayjs().format('HH:mm:ss')
    }

    try {
        await db.collection('participants').insertOne({...participant, lastStatus: Date.now()});
        await db.collection('messages').insertOne(message);
        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    };
});



app.get('/participants', async (req, res) => {
    try {
        const participants = await db.collection('participants').find().toArray();
        res.status(200).send(participants);
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
});



app.post('/messages', async (req, res) => {
    const body = req.body;
    const from = req.headers.user;
    const valid = await db.collection('participants').findOne({name: from});
    if (!valid) {
        res.status(422).send({message: 'Usuário não cadastrado'});
        return;
    } 

    const message = {
        ...body,
        from,
        time: dayjs().format('HH:mm:ss')
    }

    const validation = messagesSchema.validate(message, {abortEarly: false } );
    if (validation.error) {
        const error = validation.error.details.map((error) => error.message);
        res.status(422).send(error);
        return;
    }
    
    try {
        await db.collection('messages').insertOne(message);
        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.sendStatus(500);
    };

});



app.get('/messages', async (req, res) => {
    const { limit } = req.query;
    const dbmessages = await db.collection('messages').find().toArray();

    let messages = [];

    if (limit) {
        for (let i=0; i<limit; i++) {
            messages.push(dbmessages.reverse()[i]);
        }
    } else {
        messages = dbmessages.reverse();
    };

    
    try {
        res.status(200).send(messages);
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
});










app.listen(5000, () => console.log("Servidor rodando na porta 5000"));