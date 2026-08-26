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
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173` and select **START ENGINE**. Drive with `W A S D` or the arrow keys,
use `Shift` for nitro, `Space` for the handbrake, `C` to change camera, `P` or `Esc` to pause,
and `R` to reset the car.
