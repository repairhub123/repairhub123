const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, setDoc, doc } = require('firebase/firestore');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load config
const firebaseConfig = require('../firebase-applet-config.json');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  const sheetUrl = process.argv[2];
  if (!sheetUrl) {
    console.error('Usage: node migrate-to-firebase.js <GOOGLE_SHEET_WEBAPP_URL>');
    return;
  }

  console.log('Fetching data from Google Sheet...');
  try {
    const res = await axios.get(sheetUrl);
    let jobs = res.data.jobs || res.data;
    if (!Array.isArray(jobs)) {
      console.error('Invalid response from Google Sheet. Expected array of jobs.');
      return;
    }

    console.log(`Found ${jobs.length} jobs. Starting migration...`);

    for (const job of jobs) {
      console.log(`Migrating job: ${job.ID} - ${job.Name}`);
      // Use the existing ID as the document ID to maintain continuity
      const jobRef = doc(db, 'jobs', job.ID);
      await setDoc(jobRef, {
        ...job,
        createdAt: job.received_date ? new Date(`${job.received_date}T${job.received_time || '00:00:00'}`).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
  }
}

migrate();
