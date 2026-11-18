import express from 'express';
import cors from 'cors'
import { MongoClient } from 'mongodb';



const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGO_DB_AUTH_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

app.get('/', (req, res) => {
  res.send('Server is running Fine!');
});



app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});