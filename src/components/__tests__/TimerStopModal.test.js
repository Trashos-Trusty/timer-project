import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Timer from '../Timer';

describe('Timer stop confirmation modal', () => {
  let originalElectronAPI;
  let originalResizeObserver;

  beforeAll(() => {
    originalElectronAPI = global.window?.electronAPI;
    originalResizeObserver = global.ResizeObserver;

    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    global.ResizeObserver = MockResizeObserver;

    global.window = global.window || {};
    global.window.electronAPI = {
      saveProject: jest.fn().mockResolvedValue({}),
      getSystemIdleTime: jest.fn().mockResolvedValue(0),
      showMainWindow: jest.fn(),
      onAppClose: jest.fn(),
      showMessageBox: jest.fn(),
    };
  });

  afterAll(() => {
    global.window.electronAPI = originalElectronAPI;
    global.ResizeObserver = originalResizeObserver;
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const renderTimer = (overrideProject) => {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      status: 'paused',
      currentTime: 120,
      accumulatedSessionTime: 120,
      totalTime: 0,
      subjectHistory: ['Test subject'],
      workSessions: [],
      currentSubject: 'Test subject',
      ...overrideProject,
    };

    return render(
      <Timer
        selectedProject={project}
        onProjectUpdate={jest.fn()}
        disabled={false}
        onTimerStateChange={jest.fn()}
        onTimerSnapshot={jest.fn()}
        onToggleMiniTimer={jest.fn()}
        isMiniTimerVisible={false}
        canShowMiniTimer={false}
        onSessionExpired={jest.fn()}
      />
    );
  };

  test('keeps confirmation modal visible after manual stop of a paused session', async () => {
    const utils = renderTimer();

    const stopButton = await screen.findByRole('button', { name: /stop/i });

    fireEvent.click(stopButton);

    const confirmationTitle = await screen.findByText(/Confirmez votre travail/i);

    expect(confirmationTitle).not.toBeNull();

    await waitFor(
      () => {
        expect(screen.queryByText(/Confirmez votre travail/i)).not.toBeNull();
      },
      { timeout: 500 }
    );

    // Simulate parent providing a refreshed project instance
    const refreshedProject = {
      status: 'running',
      currentTime: 120,
      accumulatedSessionTime: 0,
      sessionStartTime: Date.now(),
      workSessions: [
        {
          id: 'session-1',
          subject: 'Test subject',
          startTime: new Date(Date.now() - 120000).toISOString(),
          endTime: new Date().toISOString(),
          duration: 120,
          date: new Date().toISOString().split('T')[0],
        },
      ],
    };

    utils.rerender(
      <Timer
        selectedProject={{
          id: 'test-project',
          name: 'Test Project',
          totalTime: 0,
          subjectHistory: ['Test subject'],
          currentSubject: 'Test subject',
          ...refreshedProject,
        }}
        onProjectUpdate={jest.fn()}
        disabled={false}
        onTimerStateChange={jest.fn()}
        onTimerSnapshot={jest.fn()}
        onToggleMiniTimer={jest.fn()}
        isMiniTimerVisible={false}
        canShowMiniTimer={false}
        onSessionExpired={jest.fn()}
      />
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Confirmez votre travail/i)).not.toBeNull();
      },
      { timeout: 500 }
    );
  });
});
