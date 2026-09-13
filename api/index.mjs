import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

// One initialization promise per warm function. Never listen on a port in Vercel.
let application;
export default async function handler(req, res) {
  application ||= openDatabase().then(db => createApp(db)).catch(error => {
    application = undefined;
    throw error;
  });
  try {
    const app = await application;
    return app(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({error: 'Wecapp is temporarily unavailable. Please retry shortly.'}));
  }
}
