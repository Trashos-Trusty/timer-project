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
    expect(manager.makeSecureRequest).toHaveBeenCalledWith('save-project', expect.any(Object));
  });

  it('sur 401, propage l’erreur pour que la queue appelle refresh puis réessaie', async () => {
    const manager = new ApiManager();
    manager.config.token = 'fake-jwt';
    manager.config.freelanceId = 'freelance-123';
    manager.config.expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    let calls = 0;
    manager.makeSecureRequest = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error('Token manquant ou invalide (401)');
        err.status = 401;
        throw err;
      }
      return {
        success: true,
        data: {
          project: {
            project_id: 7,
            project_uuid: 'after-refresh',
            currentTime: 10,
            status: 'paused'
          }
        }
      };
    });
    manager.refreshToken = jest.fn().mockResolvedValue(true);

    const savedProject = await manager.saveProject({ id: 'x', name: 'P' });

    expect(manager.refreshToken).toHaveBeenCalled();
    expect(manager.makeSecureRequest).toHaveBeenCalledTimes(2);
    expect(savedProject.id).toBe('after-refresh');
    expect(savedProject.projectId).toBe(7);
  });

  it('sur erreur HTTP non-auth (409), retourne { error } sans lever', async () => {
    const manager = new ApiManager();
    manager.config.token = 't';
    manager.config.freelanceId = 'freelance-123';
    manager.queueOperation = (operation) => operation();

    const conflict = new Error('Doublon');
    conflict.status = 409;
    conflict.statusText = 'Conflict';
    manager.makeSecureRequest = jest.fn().mockRejectedValue(conflict);

    const out = await manager.saveProject({ id: '1', name: 'A' });

    expect(out.error).toBeDefined();
    expect(out.error.status).toBe(409);
    expect(manager.makeSecureRequest).toHaveBeenCalledTimes(1);
  });
});

