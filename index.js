const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const svgson = require('svgson');
const SVGO = require('svgo');
const SVGSpriter = require ('svg-sprite');

let fullPath = process.cwd() + '/';

let opts = {
  path: '',
  subfolder: 'chameleon-sprite',
  name: 'chameleon-sprite',
  colors: {
    modifiable: true,
    naming: 'svg-custom-color',
    preserveOriginal: true,
  },
  strokeWidths: {
    modifiable: true,
    naming: 'svg-custom-stroke-width',
    nonScaling: true,
  },
  transition: 'all .3s ease'
};

let svgCount = 0;
let colorChangeCount = 0;
let strokeWidthChangeCount = 0;

module.exports.create = create;

async function create(customOptions) {
  if(customOptions) {
    applyCustomOptions(customOptions);
    updateFullPath();
  }
  // Creating the basic sprite using svg-sprite
  console.log(chalk.grey(`Creating basic sprite inside '${fullPath}${opts.subfolder}/' ...`));
  try {
    await createRegularSprite();
    console.log(chalk.grey('Basic sprite created.'));
    // After creation, read sprite and inject it with variables
    // Orignal sprite is then overridden
    console.log(chalk.grey('-------------------------------'));
    console.log(
      chalk.hex('#FFBE5E')('Modifing ') +
      chalk.hex('#FFF25E')('the ') +
      chalk.hex('#A3FF5E')('sprite ') +
      chalk.hex('#5EFF8B')('to ') +
      chalk.hex('#5EF5FF')('become ') +
      chalk.hex('#6E8EFF')('an ') +
      chalk.hex('#AE5EFF')('adaptable ') +
      chalk.hex('#FF5EDB')('chameleon') +
      chalk.hex('#FF5E84')('...'));
    console.log(chalk.grey('-------------------------------'));
    await createInjectedSprite();
    // Done!
    if(colorChangeCount) {
      console.log(chalk.grey('Injected color variables into ') + chalk.green(colorChangeCount) + chalk.grey(' attributes.'));
    }
    if(strokeWidthChangeCount) {
      console.log(chalk.grey('Injected stroke-width variables into ') + chalk.green(strokeWidthChangeCount) + chalk.grey(' attributes.'));
    }
    cleanup();
    console.log(chalk.grey('-------------------------------'));
    console.log(chalk.green.bold('Task complete!'));
  } catch(err) {
    handleError(err);
  }
}

async function createRegularSprite() {
  const spriter = new SVGSpriter({
    dest: fullPath,
    svg: {
      xmlDeclaration: false,
      doctypeDeclaration: false,
    },
    mode: {
      inline: true,
      symbol: {
        dest: opts.subfolder,
        sprite: opts.name + '.svg',
      }
    },
  });
  // This SVGO configuration converts styles from a <style> tag to inline attributes
  const svgo = new SVGO({
    plugins: [{
      inlineStyles: {
        onlyMatchedOnce: false
      }
    }]
  });
  let svgs;
  // Add all SVGs to sprite
  try {
    svgs = fs.readdirSync(fullPath);
  } catch(err) {
    throw err;
  }
  for(const item of svgs) {
    let file;
    let optimizedFile;
    if(item.endsWith('.svg')) {
      try {
        file = fs.readFileSync(fullPath + item, { encoding: 'utf-8' });
        optimizedFile = await svgo.optimize(file, {path: fullPath + item});
        spriter.add(path.resolve(fullPath + item), null, optimizedFile.data);
        svgCount++;
      } catch (err) {
        throw err;
      }
    }
  };
  if(svgCount) {
    console.log(chalk.grey('Found ') + chalk.green(svgs.length) + chalk.grey(' SVGs.'));
  } else {
    throw new Error(`No SVG files found in '${fullPath}'. Make sure you are using the correct path.`)
  }
  // Compile the sprite
  spriter.compile(function(err, result) {
    if(err) {
      throw err;
    }
    for (var mode in result) {
        for (var resource in result[mode]) {
            fs.mkdirSync(path.dirname(result[mode][resource].path), { recursive: true });
            fs.writeFileSync(result[mode][resource].path, result[mode][resource].contents);
        }
    }
  });
}

async function createInjectedSprite() {
  let jsonSprite = getSvgJson(`${fullPath}${opts.subfolder}/${opts.name}.svg`);
  let spriteCopy = JSON.parse(JSON.stringify(jsonSprite));
  spriteCopy.children.forEach(symbol => {
    modifyAttributes(symbol, new Map(), new Map());
  });
  fs.writeFileSync(`${fullPath}${opts.subfolder}/${opts.name}.svg`, svgson.stringify(spriteCopy));
}

function modifyAttributes(el, registeredColors, registeredStrokeWidths) {
  // TODO: Make Gradients work! (stop-color)
  if(el.attributes && el.name !== 'style'){
    if(opts.colors.modifiable){
      // FILL
      let fill = el.attributes.fill;
      if(fill && validValue(fill)) {
        if(registeredColors.get(fill)) {
          // If fill color has already an assigned variable
          el.attributes.fill = registeredColors.get(fill);
        } else {
          // If fill is a new color (gets registered)
          let varFill = variablizeColor(fill, registeredColors.size + 1);
          registeredColors.set(fill, varFill);
          el.attributes.fill = varFill;
        }
      }
      // STROKE
      let stroke = el.attributes.stroke;
      if(stroke && validValue(stroke)) {
        if(registeredColors.get(stroke)) {
          // If stroke has already an assigned variable
          el.attributes.stroke = registeredColors.get(stroke);
        } else {
          // If color is a new color (gets registered)
          let varStroke = variablizeColor(stroke, registeredColors.size + 1);
          registeredColors.set(stroke, varStroke);
          el.attributes.stroke = varStroke;
        }
      }
    }
    // STROKE-WIDTH
    if(opts.strokeWidths.modifiable) {
      let strokeWidth = el.attributes['stroke-width'];
      if(strokeWidth && validValue(strokeWidth)) {
        if(registeredStrokeWidths.get(strokeWidth)) {
          // If stroke-width has already an assigned variable
          el.attributes['stroke-width'] = registeredStrokeWidths.get(strokeWidth);
        } else {
          // If stroke-width is a new stroke-width (gets registered)
          let varStrokeWidth = variablizeStrokeWidth(strokeWidth, registeredStrokeWidths.size + 1);
          registeredStrokeWidths.set(strokeWidth, varStrokeWidth);
          el.attributes['stroke-width'] = varStrokeWidth;
        }
      }
    }
    // NON SCALING STROKE-WIDTH
    if(opts.strokeWidths.nonScaling && el.attributes['stroke-width']) {
      let vectorEffect = el.attributes['vector-effect'];
      if(vectorEffect && !vectorEffect.includes('non-scaling-stroke')) {
        el.attributes['vector-effect'] = vectorEffect + ' non-scaling-stroke';
      } else if(!vectorEffect) {
        el.attributes['vector-effect'] = 'non-scaling-stroke';
      }
    }

    // TRANSITION
    if(opts.transition) {
      let style = el.attributes['style'];
      el.attributes['style'] = style ? `${style} transition: ${opts.transition}` : `transition: ${opts.transition}`;
    }
  }
  // RECURSIVE FOR ALL CHILDREN
  if(el.children.length) {
    el.children.forEach(child => {
      modifyAttributes(child, registeredColors, registeredStrokeWidths);
    });
  }
}

function variablizeColor(p_color, id) {
  const varStrSpecific = `--${opts.colors.naming}-${id}`;
  const varStrGeneral = `--${opts.colors.naming}`;
  const color = opts.colors.preserveOriginal ? p_color : 'currentColor';
  colorChangeCount++;
  return `var(${varStrSpecific}, var(${varStrGeneral}, ${color}))`;
}

function variablizeStrokeWidth(strokeWidth, id) {
  const varStrSpecific = `--${opts.strokeWidths.naming}-${id}`;
  const varStrGeneral = `--${opts.strokeWidths.naming}`;
  strokeWidthChangeCount++;
  return `var(${varStrSpecific}, var(${varStrGeneral}, ${strokeWidth}))`;
}

function validValue(str) {
  return !str.includes('var(') && !str.includes('none');
}

function getSvgJson(path) {
  let file;
  try {
    file = fs.readFileSync(path);
  } catch (err) {
    console.error(err);
  }
  return svgson.parseSync(file.toString());
}

function getFolderPath(path) {
  return !path || path.endsWith('/') ? path : path +'/';
}

function updateFullPath() {
  fullPath = process.cwd() + '/' + opts.path;
}

function applyCustomOptions(customOptions) {
  opts = merge(opts, customOptions);
  opts.path = getFolderPath(opts.path);
}

// Merge a `source` object to a `target` recursively
function merge (target, source) {
  // Iterate through `source` properties and if an `Object` set property to merge of `target` and `source` properties
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object) Object.assign(source[key], merge(target[key], source[key]))
  }
  // Join `target` and modified `source`
  Object.assign(target || {}, source)
  return target
}

function handleError(err) {
  console.error(chalk.redBright(err));
  return;
}

function cleanup() {
  svgCount = 0;
  colorChangeCount = 0;
  strokeWidthChangeCount = 0;
}