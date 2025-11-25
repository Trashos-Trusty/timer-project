const ApiManager = require('../../public/utils/apiManager');

describe('ApiManager.saveProject', () => {
  it('retourne un objet projet normalisé après un POST réussi', async () => {
    const manager = new ApiManager();

    manager.config.freelanceId = 'freelance-123';
    manager.queueOperation = (operation) => operation();
    manager.makeSecureRequest = jest.fn().mockResolvedValue({
      success: true,
      data: {
        project: {
          project_id: 42,
          project_uuid: 'proj-test-uuid',
          currentTime: 3600,
          status: 'active'
        }
      }
    });

    const project = { id: null, name: 'Projet test' };
    const savedProject = await manager.saveProject(project);

    expect(savedProject).toBeTruthy();
    expect(savedProject.id).toBe('proj-test-uuid');
    expect(savedProject.projectId).toBe(42);
    expect(savedProject.currentTime).toBe(3600);
    expect(savedProject.status).toBe('active');
    expect(manager.makeSecureRequest).toHaveBeenCalledWith('projects', expect.any(Object));
  });
});

