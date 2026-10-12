const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Sign-in permission was not granted. You can try again or use email and password.",
  OAuthAccountNotLinked:
    "This email already belongs to a Needt account. Sign in using the method you used before.",
  OAuthCallback:
    "The provider could not finish signing you in. Please try again.",
  OAuthSignin: "The provider could not start sign-in. Please try again.",
  SignupsClosed:
    "Needt isn’t open for new accounts yet. Join the waitlist at needt.app and we’ll write when it opens.",
};

export function oauthErrorMessage(error: string | undefined) {
  if (!error) return null;
  return (
    AUTH_ERROR_MESSAGES[error] ??
    "We couldn’t sign you in. Please try again or use another sign-in method."
  );
}
