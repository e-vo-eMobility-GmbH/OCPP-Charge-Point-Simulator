// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom does not implement scrollIntoView, but components such as Main call it
// from a mount effect to keep the log view pinned to the bottom.
window.HTMLElement.prototype.scrollIntoView = jest.fn();
