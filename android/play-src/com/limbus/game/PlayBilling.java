package com.limbus.game;

import android.app.Activity;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// Google Play's billing for the Play build: the page sees it as window.LimbusPlay. One consumable product, crystals for
// Armamentarium; what it gives is the page's business. A purchase goes to the page (window.__playPaid(product, token)),
// which banks the crystals, saves, and answers LimbusPlay.granted(token); only then is it consumed, so it can be bought
// again. One the app missed (closed mid-purchase) comes back at the next start; the page knows the tokens it has banked.
// The page says when it is ready to take them (LimbusPlay.ready()).
public class PlayBilling implements PurchasesUpdatedListener {
  static final String PRODUCT = "crystals_everything";
  private final Activity act;
  private final WebView web;
  private final BillingClient client;
  private final SharedPreferences prefs;
  private ProductDetails details;
  private boolean ready;
  private final List<String> waiting = new ArrayList<>(); // calls for the page, until it is ready

  // MainActivity finds this class by name: the APK built without billing simply has none
  public static void attach(Activity act, WebView web) { new PlayBilling(act, web); }

  private PlayBilling(Activity act, WebView web) {
    this.act = act; this.web = web;
    prefs = act.getSharedPreferences("play", Activity.MODE_PRIVATE);
    client = BillingClient.newBuilder(act).setListener(this)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .enableAutoServiceReconnection().build();
    web.addJavascriptInterface(this, "LimbusPlay");
    client.startConnection(new BillingClientStateListener() {
      @Override public void onBillingSetupFinished(BillingResult r) {
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { page("window.__playPrice && window.__playPrice('')"); return; }
        queryProduct();
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
          (res, list) -> { if (res.getResponseCode() == BillingClient.BillingResponseCode.OK) for (Purchase p : list) handle(p); });
      }
      @Override public void onBillingServiceDisconnected() { }
    });
  }

  private void queryProduct() {
    QueryProductDetailsParams q = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
      QueryProductDetailsParams.Product.newBuilder().setProductId(PRODUCT).setProductType(BillingClient.ProductType.INAPP).build())).build();
    client.queryProductDetailsAsync(q, (r, res) -> {
      List<ProductDetails> l = res.getProductDetailsList();
      details = r.getResponseCode() == BillingClient.BillingResponseCode.OK && l != null && !l.isEmpty() ? l.get(0) : null;
      String price = details != null && details.getOneTimePurchaseOfferDetails() != null ? details.getOneTimePurchaseOfferDetails().getFormattedPrice() : "";
      page("window.__playPrice && window.__playPrice(" + quote(price) + ")");
    });
  }

  @JavascriptInterface public void ready() { act.runOnUiThread(() -> { ready = true; for (String js : waiting) web.evaluateJavascript(js, null); waiting.clear(); }); }

  @JavascriptInterface public void buy() {
    act.runOnUiThread(() -> {
      if (details == null) { page("window.__playError && window.__playError('unavailable')"); queryProduct(); return; }
      BillingFlowParams f = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(
        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build())).build();
      client.launchBillingFlow(act, f);
    });
  }

  @Override public void onPurchasesUpdated(BillingResult r, List<Purchase> list) {
    int code = r.getResponseCode();
    if (code == BillingClient.BillingResponseCode.OK && list != null) for (Purchase p : list) handle(p);
    else if (code != BillingClient.BillingResponseCode.USER_CANCELED) page("window.__playError && window.__playError('failed')");
  }

  private void handle(Purchase p) {
    if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) { page("window.__playError && window.__playError('pending')"); return; }
    if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;
    String token = p.getPurchaseToken();
    if (prefs.getStringSet("given", new HashSet<String>()).contains(token)) { consume(token); return; }
    for (String id : p.getProducts()) page("window.__playPaid && window.__playPaid(" + quote(id) + ", " + quote(token) + ")");
  }

  // the page has banked a purchase: it is consumed (and Google told it was delivered)
  @JavascriptInterface public void granted(String token) {
    act.runOnUiThread(() -> {
      Set<String> given = new HashSet<>(prefs.getStringSet("given", new HashSet<String>()));
      given.add(token); prefs.edit().putStringSet("given", given).apply();
      consume(token);
    });
  }

  private void consume(String token) { client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (res, t) -> { }); }

  private void page(String js) { act.runOnUiThread(() -> { if (ready) web.evaluateJavascript(js, null); else waiting.add(js); }); }

  private static String quote(String s) { return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"; }
}
