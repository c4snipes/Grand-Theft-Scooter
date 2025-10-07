// --> UX Prompt: super simple helpers so it feels like a student project :)
export function requestControlScheme() {
  return new Promise((resolve) => {
    const prefersArrows = window.confirm(
      'Welcome to Grand Theft Scooter!\n\nClick "OK" if you want to use the arrow keys.\nClick "Cancel" to stick with WASD.',
    );
    resolve(prefersArrows ? 'arrows' : 'wasd');
  });
}
