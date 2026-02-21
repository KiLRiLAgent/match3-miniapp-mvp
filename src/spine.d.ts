/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace SpinePlugin {
  class SpinePlugin extends Phaser.Plugins.ScenePlugin {
    add: SpineGameObjectFactory;
  }

  interface SpineGameObjectFactory {
    (
      x: number,
      y: number,
      key: string,
      animationName?: string,
      loop?: boolean
    ): SpineGameObject;
  }

  interface SpineGameObject extends Phaser.GameObjects.GameObject {
    setScale(x: number, y?: number): this;
    setPosition(x: number, y: number): this;
    setDepth(value: number): this;
    setAlpha(value: number): this;
    x: number;
    y: number;
  }
}

declare global {
  // SpinePlugin IIFE attaches to window
  // eslint-disable-next-line no-var
  var SpinePlugin: any;

  namespace Phaser {
    namespace Loader {
      interface LoaderPlugin {
        spine(
          key: string,
          jsonURL: string,
          atlasURL: string | string[],
          preMultipliedAlpha?: boolean
        ): this;
        spineAtlas(key: string, url: string, preMultipliedAlpha?: boolean): this;
      }
    }

    namespace GameObjects {
      interface GameObjectFactory {
        spine(
          x: number,
          y: number,
          key: string,
          animationName?: string,
          loop?: boolean
        ): any;
      }
    }
  }
}

export {};
