export const normalizeProjectName = (name) => {
  if (typeof name !== 'string') {
    return '';
  }

  return name.trim().toLowerCase();
};

export const findDuplicateProjectByName = (projects, targetId, targetName) => {
  if (!Array.isArray(projects)) {
    return null;
  }

  const normalizedTargetName = normalizeProjectName(targetName);

  if (!normalizedTargetName) {
    return null;
  }

  return (
    projects.find((project) => (
      project
      && project.id !== targetId
      && normalizeProjectName(project.name) === normalizedTargetName
    )) || null
  );
};
