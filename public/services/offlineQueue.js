const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const fsp = require('fs/promises');

const QUEUE_FILENAME = 'offline-save-queue.json';
let queueFilePath = null;

function getQueueFilePath() {
  if (queueFilePath) {
    return queueFilePath;
  }

  const userDataPath = app.getPath('userData');
  queueFilePath = path.join(userDataPath, QUEUE_FILENAME);
  return queueFilePath;
}

async function ensureQueueFile() {
  const filePath = getQueueFilePath();
  const dirPath = path.dirname(filePath);

  await fsp.mkdir(dirPath, { recursive: true });

  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch (error) {
    await fsp.writeFile(filePath, '[]', 'utf8');
  }

  return filePath;
}

async function readQueue() {
  const filePath = await ensureQueueFile();

  try {
    const content = await fsp.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch (error) {
    console.warn('Impossible de lire la queue offline, réinitialisation...', error);
    await fsp.writeFile(filePath, '[]', 'utf8');
    return [];
  }
}

async function writeQueue(queue) {
  const filePath = await ensureQueueFile();
  const payload = JSON.stringify(queue, null, 2);
  await fsp.writeFile(filePath, payload, 'utf8');
}

async function enqueue(sessionPayload) {
  if (!sessionPayload || typeof sessionPayload !== 'object') {
    throw new TypeError('Le payload de session doit être un objet.');
  }

  if (!sessionPayload.projectData) {
    throw new TypeError('Le payload de session doit contenir "projectData".');
  }

  let projectData;
  try {
    projectData = JSON.parse(JSON.stringify(sessionPayload.projectData));
  } catch (serializationError) {
    console.warn('Impossible de sérialiser le projet pour la file offline, utilisation du payload original.');
    projectData = sessionPayload.projectData;
  }

  const queue = await readQueue();
  const entry = {
    projectData,
    originalName: sessionPayload.originalName ?? null,
    enqueuedAt: new Date().toISOString(),
  };
  queue.push(entry);
  await writeQueue(queue);
  return entry;
}

async function getPending() {
  return await readQueue();
}

async function drain(processor) {
  if (typeof processor !== 'function') {
    throw new TypeError('Le processeur de synchronisation doit être une fonction.');
  }

  const queue = await readQueue();
  if (!queue.length) {
    return { processed: 0, failed: 0, results: [] };
  }

  const remaining = [];
  const results = [];

  for (const entry of queue) {
    try {
      await processor(entry.projectData, entry.originalName ?? null);
      results.push({ status: 'fulfilled', entry });
    } catch (error) {
      remaining.push(entry);
      results.push({ status: 'rejected', entry, error });
    }
  }

  if (remaining.length !== queue.length) {
    await writeQueue(remaining);
  }

  const processed = results.filter(result => result.status === 'fulfilled').length;
  const failed = results.length - processed;

  return { processed, failed, results };
}

module.exports = {
  enqueue,
  drain,
  getPending,
};
