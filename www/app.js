document.querySelectorAll('[data-diff]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.dataset.diff);
        if (val !== state.maxPip) {
          requestConfirmAction(() => {
            document.getElementById('modal-settings').classList.remove('open');
            startNewGame(val, state.genMode, state.boardShape);
          });
        }
      });
    });

    document.querySelectorAll('[data-shape]').forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape;
        if (shape !== state.boardShape) {
          requestConfirmAction(() => {
            document.getElementById('modal-settings').classList.remove('open');
            startNewGame(state.maxPip, state.genMode, shape);
          });
        }
      });
    });

    document.querySelectorAll('[data-gen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.gen;
        if (mode !== state.genMode) {
          requestConfirmAction(() => {
            document.getElementById('modal-settings').classList.remove('open');
            startNewGame(state.maxPip, mode, state.boardShape);
          });
        }
      });
    });
