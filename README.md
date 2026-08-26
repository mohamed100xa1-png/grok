# OpenAI Grok Curve Experiments

## Paper

This is the code for the paper [Grokking: Generalization Beyond Overfitting on Small Algorithmic Datasets](https://arxiv.org/abs/2201.02177) by Alethea Power, Yuri Burda, Harri Edwards, Igor Babuschkin, and Vedant Misra

## Installation and Training

```bash
pip install -e .
./scripts/train.py
```

## Apex Drive browser simulation

This checkout also includes a self-contained, dependency-free car simulation in `index.html`.
It runs in a modern browser and uses a hand-built canvas renderer with a closed hillside track,
vehicle telemetry, tire/grip feedback, lap timing, engine audio, and keyboard/touch controls.

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173` and select **START ENGINE**. Drive with `W A S D` or the arrow keys,
use `Space` for the handbrake, `P` to pause, and `R` to reset the car.
