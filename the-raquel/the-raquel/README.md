# The Raquel

A museum you curate. Walk it in first person, follow yourself in third person, or fly it with the drone.

## Run it on your computer

The site uses JavaScript modules, so it needs a local web server (opening index.html directly won't work).

    cd the-raquel
    python3 -m http.server 8000

Then open http://localhost:8000. In VS Code, the Live Server extension does the same thing.

## Put it online

Upload everything in this folder to a GitHub repo, then Settings → Pages → Deploy from branch → main → / (root).

## How the code is organized

    index.html            markup for the page and the curator's drawer
    style.css             interface styles
    src/
      main.js             starts everything, frame loop, keyboard shortcuts
      config.js           every tunable number and list (name, colors, lighting keyframes)
      state.js            the saved show, autosave, event bus
      engine.js           renderer, shadows, bloom, graphics quality
      input.js            keyboard, mouse, touch joystick
      cameras.js          first person, third person, drone, flying tour
      curate.js           aiming, hanging, moving and taking down works
      world/
        layout.js         floor plans: rooms, doorways, wall faces (pure math, no 3D)
        building.js       turns a floor plan into walls, floors, ceilings, skylights, benches
        sky.js            sky dome, sun position, time of day
        materials.js      procedural floor and stone textures, frames
      art/
        collection.js     Art Institute of Chicago search
        works.js          paintings, frames, labels, picture lights
      actors/
        character.js      simple jointed people (same rig a real 3D model would use)
        patrons.js        visitor behavior
        nav.js            room-to-room pathfinding and collisions
      ui/
        panel.js          the drawer, HUD, camera switcher
