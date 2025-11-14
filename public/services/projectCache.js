const { app } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const CACHE_FILENAME = 'projects-cache.json';
let cacheFilePath = null;

function getCacheFilePath() {
  if (cacheFilePath) {
    return cacheFilePath;
  }

  const userDataPath = app.getPath('userData');
  cacheFilePath = path.join(userDataPath, CACHE_FILENAME);
  return cacheFilePath;
}

async function ensureCacheFile() {
  const filePath = getCacheFilePath();
  const dirPath = path.dirname(filePath);

  await fsp.mkdir(dirPath, { recursive: true });

  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch (error) {
    await fsp.writeFile(filePath, '[]', 'utf8');
  }

  return filePath;
}

function cloneProject(project) {
  if (!project || typeof project !== 'object') {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(project));
  } catch (error) {
    return { ...project };
  }
}

function getProjectKey(project) {
  if (!project || typeof project !== 'object') {
    return null;
  }

  if (project.id !== undefined && project.id !== null) {
    return `id:${project.id}`;
  }

  if (project.name) {
    return `name:${project.name}`;
  }

  return null;
}

async function readCache() {
  const filePath = await ensureCacheFile();

  try {
    const content = await fsp.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Impossible de lire le cache de projets, réinitialisation...', error);
    await fsp.writeFile(filePath, '[]', 'utf8');
    return [];
  }
}

async function writeCache(projects) {
  const filePath = await ensureCacheFile();
  const payload = JSON.stringify(projects, null, 2);
  await fsp.writeFile(filePath, payload, 'utf8');
}

async function setProjects(projects) {
  if (!Array.isArray(projects)) {
    await writeCache([]);
    return [];
  }

  const sanitized = [];
  projects.forEach((project) => {
    const cloned = cloneProject(project);
    if (cloned) {
      sanitized.push(cloned);
    }
  });

  await writeCache(sanitized);
  return sanitized;
}

async function upsertProject(project) {
  const cloned = cloneProject(project);
  if (!cloned) {
    return [];
  }

  const projects = await readCache();
  const key = getProjectKey(cloned);

  if (!key) {
    projects.push(cloned);
    await writeCache(projects);
    return projects;
  }

  const index = projects.findIndex((existing) => getProjectKey(existing) === key);
  if (index === -1) {
    projects.push(cloned);
  } else {
    projects[index] = { ...projects[index], ...cloned };
  }

  await writeCache(projects);
  return projects;
}

module.exports = {
  getCachedProjects: readCache,
  setProjects,
  upsertProject,
};
