# minhluu2000.github.io

Source for [minhluu2000.github.io](https://minhluu2000.github.io).

Plain HTML and CSS with no build step. Edit `index.html`, run `npm test`, then push to `main`, and GitHub Pages updates the site in about a minute.

The tests open the page in Microsoft Edge at phone, tablet and desktop sizes and check layout, links and text. Run `npm install` once first. Outside links that fail to load show up as warnings and do not fail the run.

On every push to `main`, GitHub Actions runs the same tests and deploys the site only when they pass.
