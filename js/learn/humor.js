/* LUNC Battlefield — curated light chatter for the Intel feed. Game flavour only: no financial advice,
 * no price predictions, no people/communities mocked. Tags pick context; the learn layer rate-limits. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var LINES = [
    // pump
    { t: 'pump', s: 'Bulls are moving so fast the candles need a seatbelt.' },
    { t: 'pump', s: 'Green on the tape. Somebody tell the bears the coffee is decaf.' },
    { t: 'pump', s: 'Morale report: Bulls just asked if they can keep the tanks after the war.' },
    { t: 'pump', s: 'Up only? Command reminds you gravity is also on the field.' },
    { t: 'pump', s: 'The front just moved. The bears are checking if the chart is upside down.' },
    { t: 'pump', s: 'Bull artillery is firing confetti. Unofficially.' },
    { t: 'pump', s: 'Price is climbing. Our engineers are building a taller ladder, just in case.' },
    // dump
    { t: 'dump', s: 'Red candles incoming. Bears have started humming their theme song.' },
    { t: 'dump', s: 'Bulls report a "strategic repositioning" toward the snack tent.' },
    { t: 'dump', s: 'Down bad? The field medic recommends water and fewer charts.' },
    { t: 'dump', s: 'Bears pushing. Bull HQ reminds everyone that zoom-out is a valid tactic.' },
    { t: 'dump', s: 'Dip spotted. Command neither confirms nor denies it was ordered.' },
    { t: 'dump', s: 'Bears gained ground. Bulls are calling it "price discovery, scenic route".' },
    // liquidation
    { t: 'liquidation', s: 'Liquidation on the wire. Somebody\u2019s leverage just left without saying goodbye.' },
    { t: 'liquidation', s: 'A position got liquidated. The battlefield observes a moment of silence. Mostly silence.' },
    { t: 'liquidation', s: 'Leverage: the only weapon that can hit its own operator.' },
    { t: 'liquidation', s: 'Long liqs feed the bears, short liqs feed the bulls. Everyone else gets popcorn.' },
    { t: 'liquidation', s: 'Margin call heard across the valley. The echo was also leveraged.' },
    // moon shot
    { t: 'moon', s: 'Moon Shot away. Reminder: this burns pixels, not tokens.' },
    { t: 'moon', s: 'That Moon Shot was so bright the validators asked for sunglasses.' },
    { t: 'moon', s: 'Moon Shot landed. The moon would like to clarify it was not consulted.' },
    { t: 'moon', s: 'Ultimate deployed. Somewhere a chart artist just drew a rocket emoji.' },
    // rug-free / LUNC community flavour
    { t: 'rugfree', s: 'Battlefield inspection complete: zero rugs found, only sandbags.' },
    { t: 'rugfree', s: 'This war is 100% rug-free. The floors are reinforced concrete.' },
    { t: 'rugfree', s: 'Fun fact: the only thing burned here is terrain texture.' },
    { t: 'rugfree', s: 'Staking your position. Unbonding period: until the next strike lands.' },
    { t: 'rugfree', s: 'The Validator General approves this message. Quorum reached.' },
    { t: 'rugfree', s: 'Governance proposal #1: more snacks for the trenches. Passed unanimously.' },
    // strikes / play
    { t: 'strike', s: 'Direct hit. The bears have filed a complaint with the mempool.' },
    { t: 'strike', s: 'Artillery says hi. Artillery always says hi.' },
    { t: 'strike', s: 'Cluster mortars: for when one boom simply isn\u2019t diversified enough.' },
    { t: 'strike', s: 'EMP landed. Enemy armour is now running on vibes.' },
    { t: 'strike', s: 'Flare up. Even the ghosts on the chart are visible now.' },
    { t: 'miss', s: 'That strike missed. The dirt, however, will never be the same.' },
    { t: 'miss', s: 'Missed. Consider it a very expensive landscaping service.' },
    // flat / quiet
    { t: 'flat', s: 'Market is flat. Both armies are pretending to clean their rifles.' },
    { t: 'flat', s: 'Sideways action detected. The tanks are doing laps for cardio.' },
    { t: 'flat', s: 'Quiet front. Perfect time to practise those combo chains.' },
    { t: 'flat', s: 'Low volatility. Even the war room clock is yawning.' },
    { t: 'flat', s: 'Nothing moving. Somebody check the oracle is still plugged in.' },
    // v11.3 heavy weapons (game FX, not chain events)
    { t: 'nuke', s: 'Tactical burn event complete. Actual supply change: zero. Vibes change: enormous.' },
    { t: 'nuke', s: 'That mushroom cloud is purely decorative. The tokenomics are unbothered.' },
    { t: 'nuke', s: 'Mini Nuke landed. The only thing burned was the bears\' weekend plans.' },
    { t: 'moab', s: 'MOAB: Mother Of All Buy-walls. Allegedly.' },
    { t: 'moab', s: 'Big boom, small spreadsheet impact. Game FX only.' },
    { t: 'a10', s: 'BRRRRT is not a valid trading strategy, but it is a valid sound effect.' },
    { t: 'gas', s: 'Gas fees just got literal. Units are fanning the air and backing off.' },
    { t: 'medic', s: 'Medics on the field. Nobody gets left behind, not even the paper hands.' }
  ];
  // Remix templates: {a} pieces keep variety without new jokes every time.
  var REMIX = {
    templates: ['{who} report: {what}.', 'Radio check — {who}: "{what}"'],
    who: ['Forward observer', 'Bull HQ', 'Bear HQ', 'Field medic', 'Supply sergeant'],
    what: {
      pump: ['candles are taller than the watchtowers', 'we need a bigger map'],
      dump: ['we are buying the dip in sandbags', 'retreat is a strong word'],
      flat: ['still nothing, sending a postcard', 'the front is napping'],
      liquidation: ['leverage casualty on the left flank', 'someone forgot their stop-loss at home']
    }
  };
  LB.humor = { LINES: LINES, REMIX: REMIX };
})(window);
