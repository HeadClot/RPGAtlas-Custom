//=============================================================================
// CoveText.js — self-made fixture plugin (RPGAtlas test suite)
//=============================================================================
/*:
 * @target MV
 * @plugindesc v1.2 Demo: draws banner text over the map.
 * @author Cove Harbor
 * @url https://example.invalid/covetext
 *
 * @param BannerColor
 * @text Banner Color
 * @desc Which system color the banner uses.
 * @type number
 * @default 3
 *
 * @param Speed
 * @desc How fast the banner slides in.
 * @default 4
 *
 * @command showBanner
 * @text Show Banner
 * @desc Slides a text banner over the map.
 *
 * @arg text
 * @arg duration
 *
 * @help CoveText v1.2 — write a banner with the showBanner command.
 * Made only for the RPGAtlas test fixtures.
 */
(() => {
  const params = PluginManager.parameters('CoveText');
  const _update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _update.call(this);
    if ($gameSwitches.value(1)) this._coveBanner = params['BannerColor'];
  };
})();
