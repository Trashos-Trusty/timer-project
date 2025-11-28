import { findDuplicateProjectByName, normalizeProjectName } from '../utils/projectNameUtils';

describe('projectNameUtils', () => {
  test('normalizeProjectName trims and lowercases project names', () => {
    expect(normalizeProjectName('  Projet Client ')).toBe('projet client');
  });

  test('findDuplicateProjectByName detects duplicates with case-insensitive comparison', () => {
    const projects = [
      { id: 'p1', name: 'Projet Alpha' },
      { id: 'p2', name: 'Projet Beta' },
    ];

    const duplicate = findDuplicateProjectByName(projects, 'p3', 'projet alpha');

    expect(duplicate).toEqual(projects[0]);
  });

  test('findDuplicateProjectByName ignores the project currently being edited', () => {
    const projects = [
      { id: 'p1', name: 'Projet Alpha' },
      { id: 'p2', name: 'Projet Beta' },
    ];

    const duplicate = findDuplicateProjectByName(projects, 'p1', 'Projet Alpha');

    expect(duplicate).toBeNull();
  });
});
