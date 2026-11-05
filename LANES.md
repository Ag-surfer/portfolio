# Five Claude lanes

| Lane | Where | Owns | Does not touch |
|---|---|---|---|
| builder (local) | Herdr build tab / `~/Work/portfolio` on `main` | Architecture, `/office-hours`, `/autoplan`, merge integration | Feature branches mid-flight |
| reviewer (local) | Herdr review tab | `/review` on finished branches, quality bar | Implementing features |
| cloud1 | `~/Work/portfolio-lane-1` | Homepage / shell / nav / design tokens | projects showcase guts, about/contact copy |
| cloud2 | `~/Work/portfolio-lane-2` | Projects showcase + data | homepage shell, about/contact |
| cloud3 | `~/Work/portfolio-lane-3` | About + contact + shared page chrome | homepage hero, projects data |

Gate for every cloud lane: branch green → local reviewer `/review` → `/ship` when `gh` is available.
