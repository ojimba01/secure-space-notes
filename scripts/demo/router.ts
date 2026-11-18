// The demo is served as static files, with no server to answer a deep link
// such as /admin. HashRouter keeps every page under the one index.html.
export * from '../../node_modules/react-router-dom/dist/index.js';
export { HashRouter as BrowserRouter } from '../../node_modules/react-router-dom/dist/index.js';
