/* Trove — settings for this copy of the app. Safe to publish: these are public identifiers, not secrets. */
window.TROVE_CONFIG = {
  // Google sign-in + Drive sync. Only works on the web addresses listed in googleOrigins
  // (they must match "Authorized JavaScript origins" on the Google OAuth client).
  googleClientId: '159349047980-oi70dlugiv3pn20c4ptpjv22p99utg8e.apps.googleusercontent.com',
  googleApiKey: 'AIzaSyDaE5JRuF46ZQSedTTnWeOBOmhh5z_S9gg',
  googleOrigins: ['https://ghxstxch.github.io'],

  // Spotify import. The redirect address must match the app's "Redirect URI" in the Spotify dashboard exactly.
  spotifyClientId: 'c95f7edd64bb4cafbaaca8193311a1d6',
  spotifyRedirect: 'https://ghxstxch.github.io/trove/',
};
