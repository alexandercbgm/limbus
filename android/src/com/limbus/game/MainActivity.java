package com.limbus.game;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;

// The whole game is one page (assets/index.html); this activity shows it full screen, sideways, and keeps it awake.
public class MainActivity extends Activity implements ValueCallback<String> {
  private WebView web;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true); // progress lives in localStorage
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(true);
    s.setAllowFileAccessFromFileURLs(true); // the page reads its music files from assets/music
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.setBackgroundColor(0xff000000);
    setContentView(web);
    web.loadUrl("file:///android_asset/index.html");
    hideBars();
  }

  private void hideBars() {
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideBars();
  }

  // back pauses the run, then goes to the scheme; on the scheme it leaves the app
  @Override
  public void onBackPressed() {
    web.evaluateJavascript("window.__back ? window.__back() : false", this);
  }

  @Override
  public void onReceiveValue(String used) { if (!"true".equals(used)) finish(); } // the game didn't need the back press

  @Override
  protected void onPause() {
    super.onPause();
    web.evaluateJavascript("window.__silence && window.__silence()", null); // the sound stops now, not seconds later
    web.evaluateJavascript("window.__back && document.getElementById('pause').hidden && window.__rails && window.__rails.state().state === 'play' && window.__back()", null);
    web.onPause();
  }

  @Override
  protected void onStop() { super.onStop(); web.evaluateJavascript("window.__silence && window.__silence()", null); }

  @Override
  protected void onResume() { super.onResume(); web.onResume(); hideBars(); web.evaluateJavascript("window.__wake && window.__wake()", null); }
}
