import { Outlet } from 'react-router-dom';

/**
 * Settings shell. Section navigation lives in the main sidebar's Settings
 * submenu (see settingsNav.js), so this renders only the selected section.
 */
export function SettingsLayout() {
  return <Outlet />;
}
