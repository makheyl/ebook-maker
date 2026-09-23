import { bow } from './bow';
import { dance } from './dance';
import { dropIn } from './drop-in';
import { excited } from './excited';
import { grow } from './grow';
import { hop } from './hop';
import { hopIn } from './hop-in';
import { hopOut } from './hop-out';
import { jumpAway } from './jump-away';
import { lookAround } from './look-around';
import { peekIn } from './peek-in';
import { popUp } from './pop-up';
import { shakeNo } from './shake-no';
import { shiver } from './shiver';
import { sinkDown } from './sink-down';
import { spin } from './spin';
import { talk } from './talk';
import { turnAround } from './turn-around';
import { walkIn } from './walk-in';
import { walkOut } from './walk-out';
import { wave } from './wave';
import { wiggle } from './wiggle';

/** Character motions. To add one, create a file in this folder and list it here. */
export const CHARACTER_MOTIONS = [
  walkIn,
  hopIn,
  dropIn,
  popUp,
  peekIn,
  hop,
  excited,
  wave,
  bow,
  shakeNo,
  wiggle,
  shiver,
  spin,
  turnAround,
  lookAround,
  grow,
  dance,
  talk,
  walkOut,
  hopOut,
  jumpAway,
  sinkDown,
];
