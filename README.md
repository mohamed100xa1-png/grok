# OpenAI Grok Curve Experiments

## Paper

This is the code for the paper [Grokking: Generalization Beyond Overfitting on Small Algorithmic Datasets](https://arxiv.org/abs/2201.02177) by Alethea Power, Yuri Burda, Harri Edwards, Igor Babuschkin, and Vedant Misra

## Installation and Training

```bash
pip install -e .
./scripts/train.py
```

## Street Rush browser simulation

This checkout also includes a self-contained, dependency-free city racing simulation in `index.html`.
It runs in a modern browser and uses a hand-built canvas renderer with a downtown loop, black SR-08
performance car, traffic opponents, nitro, vehicle telemetry, tire/grip feedback, lap timing,
engine audio, camera modes, and keyboard/touch controls. The game opens on an Arabic open-world level hub. The `L` key or globe button reopens it during a
race, with region selection, generated map art, player profiles, activities, friends, chat, and level
cards based on the supplied world-map reference.

```bash
python3 serve.py --port 4173
```

Open `http://localhost:4173` and select a level from the world map. Drive with `W A S D` or the
arrow keys, use `Shift` for nitro, `Space` for the handbrake, `C` to change camera, `P` or `Esc` to
pause, and `R` to reset the car.

### Optional Matrix-Game 3 integration

The game includes a same-origin bridge to the official [SkyworkAI/Matrix-Game](https://github.com/SkyworkAI/Matrix-Game)
repository. It is optional because Matrix-Game 3.0 needs its separate model checkpoint, Linux, and a
CUDA/NVIDIA GPU. Without those, the browser keeps using the local map and renderer.

```bash
# clone the upstream source next to this checkout
 git clone https://github.com/SkyworkAI/Matrix-Game.git ../Matrix-Game
# point the bridge at Matrix-Game-3 and its downloaded checkpoint
export MATRIX_GAME_ROOT="$PWD/../Matrix-Game/Matrix-Game-3"
export MATRIX_GAME_CHECKPOINT="$HOME/models/Matrix-Game-3.0"
python3 serve.py --port 4173
```

The **MATRIX WORLD MODEL** button on the level hub requests a cinematic region preview. The bridge
runs generation in a background process, serves the resulting MP4 back to the same UI, and falls
back cleanly when the model is not configured.
