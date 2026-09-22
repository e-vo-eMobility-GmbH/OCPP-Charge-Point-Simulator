import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the charge point simulator', () => {
  render(<App />);
  const title = screen.getByText(/charge point simulator/i);
  expect(title).toBeInTheDocument();
});
