import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import joi from 'joi';

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect(() => {
  db = mongoClient.db('batepapoUOL');
});

const app = express();
app.use(cors());
app.use(express.json());


const participantsSchema = joi.object({
    name: joi.string().min(1).required().trim()
});

const messagesSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().min(1).required().trim(),
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
    const { limit: limitStr } = req.query;
    const limit = Number(limitStr);
    const { user } = req.headers;
    const valid = await db.collection('participants').findOne({name: user});
    
    if (!valid) {
        res.status(422).send({message: 'Usuário não conectado'});
        return;
    };

    const query = {
        $or: [
            {type: 'message'},
            {from: user},
            {to: user},
            {to: 'Todos'}
        ]
    };

    let dbmessages = await db.collection('messages').find(query).toArray();

    if (limit) {
        dbmessages = (await db.collection('messages').find(query).sort({_id: -1}).limit(limit).toArray()).reverse();
    };
    
    try {
        res.status(200).send(dbmessages);
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
});

app.post('/status', async (req, res) => {
    const { user } = req.headers;
    const valid = await db.collection('participants').findOne({name: user});
    console.log(valid);

    if (!valid) {
        res.sendStatus(404);
        return;
    }

    try {
        res.sendStatus(200);

        const userOn = { name: user };
        const attUser = { $set: { lastStatus: Date.now() } };

        await db.collection('participants').updateOne(userOn, attUser);

      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
});


app.delete('/messages/:id', async (req, res) => {
    const { user } = req.headers;
    const id = req.params.id;

    const messageDelete = await db.collection('messages').findOne({ _id: new ObjectId(id) });

        if (!messageDelete) {
            res.sendStatus(404);
            return;
        };
        
        if (messageDelete.from !== user) {
            res.sendStatus(401);
            return;
        }

     try {
        await db.collection('messages').deleteOne({ _id: new ObjectId(id) });
        res.sendStatus(200);
    }   catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});


setInterval(async () => {
    const participants = await db.collection('participants').find().toArray();
    const participantsOffline = participants.filter(participant => participant.lastStatus < (Date.now() - 10000));
    
    try {
        await db.collection('participants').deleteMany({ lastStatus: { $lt: (Date.now() - 10000)} });

        participantsOffline.forEach(async (participant) => {
            await db.collection('messages').insertOne({
                from: participant.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            });
        });

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
}, 15000);


app.listen(5000, () => console.log('Listening on port 5000'));