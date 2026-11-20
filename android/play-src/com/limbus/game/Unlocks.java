package com.limbus.game;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

// The week's free level, on Google Play: when it opens, a notification in the phone's notification shade ("Labyrinthus is open,
// free"), whether the game is open or not; a tap on it opens the game. The page sets the time (LimbusPlay.notifyAt, see
// PlayBilling); the phone's alarm service wakes this receiver then, which posts it. Kept through a restart of the phone.
public class Unlocks extends BroadcastReceiver {
  static final String CHANNEL = "unlocks";

  static SharedPreferences prefs(Context c) { return c.getSharedPreferences("unlocks", Context.MODE_PRIVATE); }

  // set (or, at <= 0, take back) the one notification to come
  static void set(Activity act, long at, String title, String text) {
    prefs(act).edit().putLong("at", at).putString("title", title).putString("text", text).apply();
    if (at > 0 && Build.VERSION.SDK_INT >= 33 && act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
      act.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7); // Android 13 and on asks the player once
    arm(act);
  }

  static void arm(Context c) {
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, Unlocks.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    am.cancel(pi);
    long at = prefs(c).getLong("at", 0);
    if (at > 0) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, Math.max(at, System.currentTimeMillis() + 1000), pi); // (inexact, within minutes)
  }

  @Override public void onReceive(Context c, Intent in) {
    if (Intent.ACTION_BOOT_COMPLETED.equals(in.getAction())) { arm(c); return; } // alarms are lost with a restart: set again
    SharedPreferences p = prefs(c); long at = p.getLong("at", 0);
    if (at <= 0) return;
    if (System.currentTimeMillis() < at - 60000) { arm(c); return; } // woken early: wait on
    NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Limbus", NotificationManager.IMPORTANCE_DEFAULT));
    Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
    PendingIntent tap = PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
    b.setSmallIcon(c.getApplicationInfo().icon).setContentTitle(p.getString("title", "Limbus")).setContentText(p.getString("text", ""))
      .setContentIntent(tap).setAutoCancel(true);
    try { nm.notify(1, b.build()); } catch (SecurityException e) { /* notifications not allowed */ }
    p.edit().putLong("at", 0).apply();
  }
}
