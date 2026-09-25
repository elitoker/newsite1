# Museum Machine

Build a museum, hang a show, and walk through it. Walk it in first person, follow yourself in third person, or fly it with the drone.

## Ways to play

- **New game**: seven commissions, each with a brief. Hang the show, open the doors, and a critic walks through, reacts at every work and writes a review. Stars unlock the next commission.
- **Free play**: answer four questions (what kind of museum, where it stands, what hangs, when you arrive) and open with a full show or empty walls.
- **Famous museums**: galleries styled after the Louvre, the Met, MoMA, Tate Modern, the Musée d'Orsay, the Uffizi and the Detroit Institute of Arts.
- **Live shows**: type an artist and a museum ("Vermeer at the Met") and walk into that show, built from the artist's public domain work in that museum's style.

Every artist with work on the walls is in the building too, in a beret, in the room where most of their work hangs. Walk up and they say hello; ask for a tour and they walk you to each of their works. What they say comes from real sources (Wikidata, Wikipedia and the museum's own wall text) turned into their voice. Raquel Weinberg's words live in src/art/voices.js, written by hand.

## Run it on your computer

The site uses JavaScript modules, so it needs a local web server (opening index.html directly won't work). Open PowerShell in this folder and run

    powershell -ExecutionPolicy Bypass -File serve.ps1

Then open http://localhost:8000. If you have Python, `python -m http.server 8000` works too.

## Put it online

Keep index.html at the top level of the repo, not inside a subfolder. Then in GitHub go to Settings → Pages → Deploy from branch → main → / (root).

## Art sources

Search asks every source for works by the artist first, then shows other matches.

- Cleveland Museum of Art Open Access (public domain, cc0)
- The Metropolitan Museum of Art open API (public domain works)
- Wikidata and Wikimedia Commons, for thousands of lesser-known artists
- Raquel Weinberg's work, from raquelrudy.com
- Your own images, as a file or a link

Cleveland and Met images load through wsrv.nl, a free image relay, because those museums' image servers don't allow web pages to use their images as 3D textures.

## Controls

W A S D walk, Shift faster, drag with the mouse to look. 1 2 3 switch camera. Esc opens the curator's drawer, P the floor plan. Click hangs a held work, E moves, X takes down, R turns furniture, V hangs at any height, Q cancels. M mutes music. In the drone, Space and C fly up and down, T flies the tour.

## How the code is organized

    index.html            markup for the menu, the drawer, the floor plan and story cards
    style.css             interface styles
    serve.ps1             local web server (no install needed)
    assets/               menu background renders
    src/
      main.js             starts everything, frame loop, keyboard shortcuts
      config.js           every tunable number and list
      state.js            the saved museum, save slots, event bus
      engine.js           renderer, shadows, bloom, graphics quality, adaptive resolution
      input.js            keyboard, mouse drag, touch joystick
      cameras.js          first person, third person, drone, flying tour
      curate.js           aiming, hanging, placing furniture and spotlights
      audio.js            generative background music and visitor murmur
      world/
        layout.js         floor plans: rooms, doorways, windows, floating walls, faces (pure math)
        building.js       walls, floors, ceilings, skylights, glass, merged for speed
        lighting.js       room lamps, picture lights, spotlights, ceiling fixtures
        outside.js        park, city or plaza around the building
        furniture.js      furniture, sculpture, pools and floating walls
        sky.js            sky dome, sun position, time of day
        materials.js      procedural textures: wood, plaster, stone, grass, city windows
      art/
        collection.js     search across Cleveland, the Met and Wikidata/Commons
        raquel.js         Raquel Weinberg's works
        artistinfo.js     what an artist can truthfully say: Wikidata, Wikipedia, wall text
        voices.js         Raquel's own words for her tour, written by hand
        works.js          paintings, frames, labels, picture lights
      actors/
        character.js      simple jointed people (same rig a real 3D model would use)
        patrons.js        visitor behavior
        guards.js         a guard in every room, with something to say
        artists.js        the artists themselves, who give tours of their work
        nav.js            room-to-room pathfinding and collisions
      game/
        modes.js          the opening menu and the four modes
        story.js          commissions, the critic, reviews and stars
        styles.js         famous-museum looks and free play choices
        show.js           building and hanging a whole show automatically
      ui/
        panel.js          the curator's drawer and HUD
        planner.js        the 2D floor plan and wall editor
      dev/
        shot.js           renders the menu background (open /?shot with serve.ps1 -AllowSave)
