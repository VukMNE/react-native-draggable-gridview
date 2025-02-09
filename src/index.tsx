/**
 * react-native-draggable-gridview
 */

import React, { memo, useRef, useState, useCallback } from 'react'
import { Dimensions, LayoutRectangle } from 'react-native'
import { View, ViewStyle, TouchableOpacity } from 'react-native'
import { Animated, Easing, EasingFunction } from 'react-native'
import { ScrollView, ScrollViewProps } from 'react-native'
import { PanResponder, PanResponderInstance } from 'react-native'
import _ from 'lodash'

const { width: screenWidth } = Dimensions.get('window')

interface GridViewProps extends ScrollViewProps {
  numColumns?: number
  containerMargin?: ContainerMargin
  gridCellSize?: GridCellSize
  width?: number
  data: any[]
  activeOpacity?: number
  delayLongPress?: number
  selectedStyle?: ViewStyle
  animationConfig?: AnimationConfig
  keyExtractor?: (item: any) => string
  renderItem: (item: any, index?: number) => JSX.Element
  renderLockedItem?: (item: any, index?: number) => JSX.Element
  locked?: (item: any, index?: number) => boolean
  onBeginDragging?: (item: any, index?: number) => void
  onPressCell?: (item: any, index?: number) => void
  onReleaseCell?: (data: any[]) => void
  onEndAddAnimation?: (item: any) => void
  onEndDeleteAnimation?: (item: any) => void
}

interface AnimationConfig {
  isInteraction?: boolean
  useNativeDriver: boolean
  easing?: EasingFunction
  duration?: number
  delay?: number
}

interface ContainerMargin {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

interface GridCellSize {
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

interface Item {
  item: any
  pos: Animated.ValueXY
  opacity: Animated.Value
}

interface State {
  scrollView?: ScrollView
  frame?: LayoutRectangle
  contentOffset: number
  numRows?: number
  cellSize?: {width: number, height: number}
  grid: Point[]
  items: Item[]
  animation?: Animated.CompositeAnimation
  animationId?: number // Callback ID for requestAnimationFrame
  startPoint?: Point // Starting position when dragging
  startPointOffset?: number // Offset for the starting point for scrolling
  move?: number // The position for dragging
  panResponder?: PanResponderInstance
}

const GridView = memo((props: GridViewProps) => {
  const {
    data,
    keyExtractor,
    renderItem,
    renderLockedItem,
    locked,
    onBeginDragging,
    onPressCell,
    onReleaseCell,
    onEndAddAnimation,
    onEndDeleteAnimation,
    ...rest
  } = props
  const numColumns = rest.numColumns || 1
  const top = rest.containerMargin?.top || 0
  const bottom = rest.containerMargin?.bottom || 0
  const left = rest.containerMargin?.left || 0
  const right = rest.containerMargin?.right || 0
  const width = rest.width || screenWidth
  const activeOpacity = rest.activeOpacity || 0.5
  const delayLongPress = rest.delayLongPress || 500
  const selectedStyle = rest.selectedStyle || {
    shadowColor: '#000',
    shadowRadius: 8,
    shadowOpacity: 0.2,
    elevation: 10,
    transform: [{scale: 1.05}]
  }
 
   const [selectedItem, setSelectedItem] = useState<Item | null>(null)
   const self = useRef<State>({
     contentOffset: 0,
     grid: [],
     items: [],
     startPointOffset: 0,
   }).current
 
   //-------------------------------------------------- Preparing
   const prepare = useCallback(() => {
     if (!data) return
     // console.log('[GridView] prepare')
     const diff = data.length - self.grid.length
     if (Math.abs(diff) == 1) {
       prepareAnimations(diff)
     } else if (diff != 0) {
       onUpdateGrid()
     } else if (
       _.findIndex(self.items, (v: Item, i: number) => v.item != data[i]) >= 0
     ) {
       onUpdateData()
     }
   }, [data, selectedItem])
 
   const onUpdateGrid = useCallback(() => {
     // console.log('[GridView] onUpdateGrid')
     const cellSize = rest.gridCellSize
     self.cellSize = cellSize
     self.numRows = Math.ceil(data.length / numColumns)
     const grid: Point[] = []
     if(cellSize){
       console.log('Tu smo 1')
       for (let i = 0; i < data.length; i++) {
         const x = (i % numColumns) * cellSize.width
         const y = Math.floor(i / numColumns) * cellSize.height
         grid.push({ x, y })
       }
       self.grid = grid
     }
     onUpdateData()
   }, [data, selectedItem])
 
   const onUpdateData = useCallback(() => {
     // console.log('[GridView] onUpdateData')
 
     // Stop animation
     stopAnimation()
 
     const { grid } = self
     self.items = data.map((item, i) => {
       const pos = new Animated.ValueXY(grid[i])
       const opacity = new Animated.Value(1)
       const item0: Item = { item, pos, opacity }
       // While dragging
       if (selectedItem && selectedItem.item == item) {
         const { x: x0, y: y0 }: {x: any, y: any} = selectedItem.pos
         const x = x0['_value']
         const y = y0['_value']
         if (!self.animation) pos.setValue({ x, y })
         selectedItem.item = item
         selectedItem.pos = pos
         selectedItem.opacity = opacity
         self.startPoint = { x, y }
       }
       return item0
     })
   }, [data, selectedItem])
 
   const prepareAnimations = useCallback(
     (diff: number) => {
       const config = rest.animationConfig || {
         easing: Easing.ease,
         duration: 300,
         useNativeDriver: true,
       }
 
       const grid0 = self.grid
       const items0 = self.items
       onUpdateGrid()
       const { grid, items } = self
 
       const diffItem: Item | undefined = _.head(
         _.differenceWith(
           diff < 0 ? items0 : items,
           diff < 0 ? items : items0,
           (v1: Item, v2: Item) => v1.item == v2.item
         )
       )
       // console.log('[GridView] diffItem', diffItem)
 
       const animations = (diff < 0 ? items0 : items).reduce((prev: any[], curr, i) => {
        // Ignore while dragging
        if (selectedItem && curr.item == selectedItem.item) return prev

        let toValue: { x: number; y: number }

        if (diff < 0) {
          // Delete
          const index = _.findIndex(items, { item: curr.item })
          toValue = index < 0 ? grid0[i] : grid[index]
          if (index < 0) {
            prev.push(Animated.timing(curr.opacity, { toValue: 0, ...config }))
          }
        } else {
          // Add
          const index = _.findIndex(items0, { item: curr.item })
          if (index >= 0) curr.pos.setValue(grid0[index])
          toValue = grid[i]
          if (diffItem?.item == curr.item) {
            curr.opacity.setValue(0)
            prev.push(Animated.timing(curr.opacity, { toValue: 1, ...config }))
          }
        }

        // Animation for position
        prev.push(Animated.timing(curr.pos, { toValue, ...config }))
        return prev
      }, [])

      if (diff < 0) {
        self.items = items0
        self.grid = grid0
      }

      // Stop animation
      stopAnimation()

      self.animation = Animated.parallel(animations)
      self.animation.start(() => {
        // console.log('[Gird] end animation')
        self.animation = undefined
        if (diff < 0) {
          self.items = items
          self.grid = grid
          onEndDeleteAnimation && onEndDeleteAnimation(diffItem?.item)
        } else {
          onEndAddAnimation && onEndAddAnimation(diffItem?.item)
        }
      })
    },
    [data, selectedItem]
  )

  const stopAnimation = useCallback(() => {
    if (self.animation) {
      self.animation.stop()
      self.animation = undefined
    }
  }, [])

  prepare()

  //-------------------------------------------------- Handller
  const onLayout = useCallback(
    ({
      nativeEvent: { layout },
    }: {
      nativeEvent: { layout: LayoutRectangle }
    }) => (self.frame = layout),
    []
  )

  const animate = useCallback(() => {
    if (!selectedItem) return

    const { move, frame, cellSize } = self
    const s = cellSize ? cellSize.height / 2 : 48 // 48 is added here just to pass tsconfig
    let a = 0
    console.log('top: ' + top)
    console.log('bottom: ' + bottom)
    console.log('Tu smo q')
    if (move && top && s && frame && bottom){
      console.log('Tu smo 2')
      if (move < top + s) {
        a = Math.max(-s, move - (top + s)) // above
      } else if (move > frame.height - bottom - s) {
        a = Math.min(s, move - (frame.height - bottom - s)) // below
      }
      a && scroll((a / s) * 10) // scrolling
    }    

    self.animationId = requestAnimationFrame(animate)
  }, [selectedItem])
 
  const scroll = useCallback(
    (offset: number) => {
      const { scrollView, cellSize, numRows, frame, contentOffset } = self
      console.log('Tu smo 3')
      if(cellSize && frame && top && bottom && numRows && scrollView ){
        console.log('Tu smo 4')
        const max = cellSize.height * numRows - frame.height + top + bottom
        const offY = Math.max(0, Math.min(max, contentOffset + offset))
        const diff = offY - contentOffset
        if (self.startPointOffset && Math.abs(diff) > 0.2) {
          // Set offset for the starting point of dragging
          self.startPointOffset += diff
          // Move the dragging cell
          if(selectedItem != null) {
            const { x: x0, y: y0 }: {x: any, y: any} = selectedItem.pos
            const x = x0['_value']
            const y = y0['_value'] + diff
            selectedItem.pos.setValue({ x, y })
            reorder(x, y)
            scrollView.scrollTo({ y: offY, animated: false })
          }
        }
      }
    },
    [selectedItem]
  )

  const onScroll = useCallback(
    ({
      nativeEvent: {
        contentOffset: { y },
      },
    }: {
      nativeEvent: { contentOffset: { y: number } }
    }) => (self.contentOffset = y),
    []
  )

  const onLongPress = useCallback(
    (item: string, index: number, position: Point) => {
      if (self.animation) return

      // console.log('[GridView] onLongPress', item, index)
      self.startPoint = position
      self.startPointOffset = 0
      setSelectedItem(self.items[index])
      onBeginDragging && onBeginDragging(self.items[index], index)
    },
    [onBeginDragging]
  )

  const reorder = useCallback(
    (x: number, y: number) => {
      if (self.animation) return

      const { numRows, cellSize, grid, items } = self
      if(cellSize && numRows && grid && items) {
      let colum = Math.floor((x + cellSize.width / 2) / cellSize.width)
      colum = Math.max(0, Math.min(numColumns, colum))

      let row = Math.floor((y + cellSize.height / 2) / cellSize.height)
      row = Math.max(0, Math.min(numRows, row))

      const index = Math.min(items.length - 1, colum + row * numColumns)
      const isLocked = locked && locked(items[index].item, index)
      if(items != null && selectedItem != null) {
        const itemIndex = _.findIndex(items, (v) => v.item == selectedItem.item)
        if (isLocked || itemIndex == index) return
        swap(items, index, itemIndex)
      }

      
      const animations = items.reduce((prev, curr, i) => {
        index != i &&
          prev.push(
            Animated.timing(curr.pos, {
              toValue: grid[i],
              easing: Easing.ease,
              duration: 200,
              useNativeDriver: true,
            })
          )
        return prev
      }, [] as Animated.CompositeAnimation[])

      self.animation = Animated.parallel(animations)
      self.animation.start(() => (self.animation = undefined))
    }
    },
    [selectedItem]
  )

  //-------------------------------------------------- PanResponder
  const onMoveShouldSetPanResponder = useCallback((): boolean => {
    if (!self.startPoint) return false
    const shoudSet = selectedItem != null
    if (shoudSet) {
      // console.log('[GridView] onMoveShouldSetPanResponder animate')
      animate()
    }
    return shoudSet
  }, [selectedItem])

 
  const onMove = useCallback(
    (event, { moveY, dx, dy }: { moveY: number; dx: number; dy: number }) => {
      const { startPoint, startPointOffset, frame } = self
        if(frame && startPoint) {
        self.move = moveY - frame.y
        let { x, y } = startPoint
        // console.log('[GridView] onMove', dx, dy, moveY, x, y)
        x += dx
        y += dy + ( startPointOffset ? startPointOffset : 0)
        if(selectedItem != null){
          selectedItem.pos.setValue({ x, y })
        }  
        reorder(x, y)
      }
    },
    [selectedItem]
  )

  const onRelease = useCallback(() => {
    if (!self.startPoint) return
    // console.log('[GridView] onRelease')
    if(self.animationId){
      cancelAnimationFrame(self.animationId)
    }
    self.animationId = undefined
    self.startPoint = undefined
    const { grid, items } = self
    if(selectedItem != null) {
      const itemIndex = _.findIndex(items, (v) => v.item == selectedItem.item)
      itemIndex >= 0 &&
        Animated.timing(selectedItem.pos, {
          toValue: grid[itemIndex],
          easing: Easing.out(Easing.quad),
          duration: 200,
          useNativeDriver: true,
        }).start(onEndRelease)
    }
  }, [selectedItem])

  const onEndRelease = useCallback(() => {
    // console.log('[GridView] onEndRelease')
    onReleaseCell && onReleaseCell(self.items.map((v) => v.item))
    setSelectedItem(null)
  }, [onReleaseCell])
 
   //-------------------------------------------------- Render
  const _renderItem = useCallback(
    (value: Item, index: number) => {
      // Update pan responder
      if (index == 0) {
        self.panResponder = PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onStartShouldSetPanResponderCapture: () => false,
          onMoveShouldSetPanResponder: onMoveShouldSetPanResponder,
          onMoveShouldSetPanResponderCapture: onMoveShouldSetPanResponder,
          onShouldBlockNativeResponder: () => false,
          onPanResponderTerminationRequest: () => false,
          onPanResponderMove: onMove,
          onPanResponderRelease: onRelease,
          onPanResponderEnd: onRelease,
        })
      }

      const { item, pos, opacity } = value
      // console.log('[GridView] renderItem', index, id)
      const { cellSize, grid } = self
      const p = grid[index]
      const isLocked = locked && locked(item, index)
      const key =
        (keyExtractor && keyExtractor(item)) ||
        (typeof item == 'string' ? item : `${index}`)
      if(cellSize) {
        let style: ViewStyle = {
          position: 'absolute',
          width: cellSize.width,
          height: cellSize.height,
        }

        if (!isLocked && selectedItem && value.item == selectedItem.item)
          style = { zIndex: 1, ...style, ...selectedStyle }

        return isLocked ? (
          <View key={key} style={[style, { left: p.x, top: p.y }]}>
            {renderLockedItem && renderLockedItem(item, index)}
          </View>
        ) : (
          <Animated.View
            {...self.panResponder?.panHandlers}
            key={key}
            style={[
              style,
              {
                transform: pos.getTranslateTransform(),
                opacity,
              },
            ]}
          >
            <TouchableOpacity
              style={{ flex: 1, justifyContent: 'center'}}
              activeOpacity={activeOpacity}
              delayLongPress={delayLongPress}
              onLongPress={() => onLongPress(item, index, p)}
              onPress={() => onPressCell && onPressCell(item, index)}
            >
              {renderItem(item, index)}
            </TouchableOpacity>
          </Animated.View>
        )
      }
    },
    [selectedItem, renderLockedItem, renderItem]
  )
 
  // console.log('[GridView] render', data.length)
  return (
    <ScrollView
      {...rest}
      ref={(ref) => {
        if(self.scrollView && ref){
          (self.scrollView = ref)
        }
      }}
      onLayout={onLayout}
      onScroll={onScroll}
      scrollEnabled={!selectedItem}
      scrollEventThrottle={16}
      contentContainerStyle={{
        marginTop: top,
        marginBottom: bottom,
        marginLeft: left,
        marginRight: right
      }}
    >
      <View
        style={{
          height: self.numRows && self.cellSize  ? Math.max(top + self.numRows * self.cellSize.height + bottom, Dimensions.get('window').height) : 0,
        }}
      />
      {self.items.map((v, i) => _renderItem(v, i))}
    </ScrollView>
  )
})
 
 /**
  * swap
  * @param array
  * @param i
  * @param j
  */
 const swap = (array: any[], i: number, j: number) =>
   array.splice(j, 1, array.splice(i, 1, array[j])[0])
 
 export default GridView
