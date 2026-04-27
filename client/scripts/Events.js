import Draw from "./Draw";

/**
 * Relay-only handler: peer's striker-placement slider preview.
 * All other gameplay state arrives via gameInit / physicsFrame / pocketEvent
 * / turnResolved (handled directly in Board.jsx).
 */
export const handleStrikerSliderUpdate = (
    data,
    { roomName, strikerRef, handRef, setHandState, canvasRef, playerRole, createGameState },
) => {
    if (
        data.roomName !== roomName ||
        data.playerRole === playerRole ||
        !strikerRef.current ||
        !handRef.current
    ) return;

    const newX = handRef.current.sliderToX(data.sliderValue, data.playerRole);
    strikerRef.current.updatePosition(newX, strikerRef.current.y);

    // Mirror the remote slider value into our local coordinate system.
    const localSliderValue =
        data.playerRole !== playerRole ? 100 - data.sliderValue : data.sliderValue;
    handRef.current.sliderValue = localSliderValue;
    setHandState(handRef.current.getState());

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) Draw.drawBoard(ctx, createGameState(), playerRole);
};
